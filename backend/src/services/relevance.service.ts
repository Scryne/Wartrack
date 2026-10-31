import { NotFoundError, noul, type TypeSafeClient } from "@typesafe-ai/sdk";
import { getTypeSafeClient, isRetiredModelError } from "../lib/typesafe";
import db from "../db";

/**
 * Topic relevance: is a story about the conflict and security situation?
 *
 * The gazetteer answers "where" — a musical review set in Tel Aviv, an
 * election poll in Jerusalem and an Israeli arrested in Bangkok all carry a
 * coordinate. Whether a story is about the theatre is a judgment about what the
 * text says, so it is asked of a TypeSafe System One model as one yes/no
 * question per story, and the threshold is applied here, in code.
 *
 * Measured 2026-10-31 on jev-1.14.0 (docs/konu-suzgeci.md): 83 hand-labelled
 * stories, 0 false accepts and 0 misses at 0.35; a held-out set of 50 drawn
 * afterwards, 0 false accepts and 1 miss (a sanctions-evasion economics piece).
 * Choice over topic labels was markedly worse (14 false accepts) and is not used.
 *
 * Without TYPESAFE_API_KEY, or with THEATRE_CLASSIFIER=0, nothing is classified:
 * theatreScore stays NULL, which THEATRE_SQL treats as relevant, so the
 * application keeps its gazetteer-only behaviour.
 */

export const THEATRE_MODEL = "jev-1.14.0";
export const THEATRE_THRESHOLD = 0.35;

/** One condition for "belongs in the theatre", shared by feed, map, brief, events. */
export const THEATRE_SQL = `lat IS NOT NULL AND lng IS NOT NULL AND (theatreScore IS NULL OR theatreScore >= ${THEATRE_THRESHOLD})`;

/** Same condition for a query that aliases articles (e.g. `a.`). */
export function theatreSql(alias: string): string {
  const p = `${alias}.`;
  return `${p}lat IS NOT NULL AND ${p}lng IS NOT NULL AND (${p}theatreScore IS NULL OR ${p}theatreScore >= ${THEATRE_THRESHOLD})`;
}

export const THEATRE_QUESTION = noul(
  "Is this news story mainly about the armed conflict and security situation in the Middle East theatre (Israel, Palestinian territories, Lebanon, Syria, Iraq, Iran, Yemen, the Gulf states, the Red Sea and nearby waters)?",
  {
    true: "The story's main subject is military or armed action in the region (strikes, attacks, interceptions, raids, demolitions or displacement by security forces, armed groups, militias), threats or plans of such action, blockades and war-related economic pressure, military aid or alliances, or diplomacy and security talks whose purpose is to start, prevent or end such conflict.",
    false: "The story is mainly about something else, even if it mentions the region: elections and campaign politics, domestic policy, courts and ordinary crime, culture, religion, sports, science, health, human-interest features, media, or events outside the region (Korea, Sudan, Europe, the Americas, Africa)."
  }
);

export interface StoryForRelevance {
  id: number;
  source: string;
  title: string;
  description: string | null;
}

export interface Classifier {
  classify(story: StoryForRelevance): Promise<{ score: number; model: string }>;
}

class TypeSafeClassifier implements Classifier {
  private model = THEATRE_MODEL;

  constructor(private client: TypeSafeClient) {}

  async classify(story: StoryForRelevance): Promise<{ score: number; model: string }> {
    const state = { source: story.source, title: story.title, description: story.description ?? "" };
    try {
      const res = await this.client.systemOne({ model: this.model, state, questions: { theatre: THEATRE_QUESTION } });
      return { score: res.answers.theatre.noul, model: res.model };
    } catch (err) {
      // Pinned Jev versions are retired without notice. Fall back to the
      // current model rather than silently stop classifying; the row records
      // which model answered.
      if (err instanceof NotFoundError || isRetiredModelError(err)) {
        if (this.model !== "jev-latest") {
          console.warn(`[RELEVANCE] ${this.model} kalkmış; jev-latest'e geçiliyor (eşik ${THEATRE_MODEL} ile ölçüldü).`);
          this.model = "jev-latest";
          return this.classify(story);
        }
      }
      throw err;
    }
  }
}

let classifier: Classifier | null | undefined;

/** The configured classifier, or null when relevance classification is off. */
export function getClassifier(): Classifier | null {
  if (classifier !== undefined) return classifier;
  const client = process.env.THEATRE_CLASSIFIER === "0" ? null : getTypeSafeClient();
  classifier = client ? new TypeSafeClassifier(client) : null;
  return classifier;
}

/** For tests: inject a fake, or null to disable. */
export function setClassifier(next: Classifier | null): void {
  classifier = next;
}

const pendingStmt = () =>
  db.prepare(`
    SELECT id, source, title, description
    FROM articles
    WHERE lat IS NOT NULL AND lng IS NOT NULL AND theatreScore IS NULL
    ORDER BY COALESCE(pubDate, createdAt) DESC
    LIMIT ?
  `);

const saveStmt = () => db.prepare("UPDATE articles SET theatreScore = ?, theatreModel = ? WHERE id = ?");

// Auto events are the ones linked to an article; a manual event has none.
const dropOffTopicEventsStmt = () =>
  db.prepare(`
    DELETE FROM events
    WHERE articleId IS NOT NULL
      AND articleId IN (SELECT id FROM articles WHERE theatreScore < ${THEATRE_THRESHOLD})
  `);

export interface ClassifyResult {
  classified: number;
  offTopic: number;
  failed: number;
  removedEvents: number;
}

/**
 * Classify up to `limit` placed-but-unclassified stories, newest first.
 * A failed call leaves the row NULL so the next cycle retries it.
 */
export async function classifyPendingArticles(limit = 60, concurrency = 4): Promise<ClassifyResult> {
  const result: ClassifyResult = { classified: 0, offTopic: 0, failed: 0, removedEvents: 0 };
  const active = getClassifier();
  if (!active) return result;

  const queue = pendingStmt().all(limit) as StoryForRelevance[];
  if (queue.length === 0) return result;
  const save = saveStmt();

  let firstError: unknown = null;
  const worker = async () => {
    for (let story = queue.shift(); story; story = queue.shift()) {
      try {
        const { score, model } = await active.classify(story);
        save.run(score, model, story.id);
        result.classified += 1;
        if (score < THEATRE_THRESHOLD) result.offTopic += 1;
      } catch (err) {
        result.failed += 1;
        firstError ??= err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  if (firstError) console.warn(`[RELEVANCE] ${result.failed} haber sınıflanamadı:`, String(firstError));
  result.removedEvents = dropOffTopicEventsStmt().run().changes;
  return result;
}
