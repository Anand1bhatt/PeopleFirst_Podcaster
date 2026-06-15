import { NextRequest, NextResponse } from "next/server";
import { fetchEverythingOrRss } from "@/lib/news/newsapi";
import { getNewsApiKey } from "@/lib/news/news-key";
import { createBriefing } from "@/lib/db/briefings";
import { briefingQueue, isQueueAvailable } from "@/lib/queue/client";
import { runPipeline } from "@/lib/pipeline/run";
import type { Source } from "@/types";

/**
 * Check if article is relevant to the query keywords
 */
function isRelevant(article: { title: string; url: string }, keywords: string[]): boolean {
  const text = `${article.title} ${article.url}`.toLowerCase();
  return keywords.some(keyword => text.includes(keyword.toLowerCase()));
}

/**
 * Find first relevant article from results, or null
 */
function findRelevantArticle(articles: any[], keywords: string[]): any | null {
  return articles.find(article => isRelevant(article, keywords)) || null;
}

/**
 * Automatically fetch trending news and create a briefing with 3 sections:
 * 1. Reliance/Jio (validates keywords present)
 * 2. India local state (Maharashtra)
 * 3. Pan India
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = await getNewsApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "NEWS_API_KEY not configured" },
        { status: 500 }
      );
    }

    const sources: Omit<Source, "id">[] = [];

    // STEP 1: Fetch Reliance/Jio news with validation
    console.log("[auto-briefing] Fetching Reliance/Jio news...");
    let relianceArticle = null;
    
    // Try primary query
    let relianceRes = await fetchEverythingOrRss(apiKey, "Reliance Jio OR Reliance Industries", {
      pageSize: 5,
      language: "en",
    });
    
    relianceArticle = findRelevantArticle(relianceRes.articles, ["reliance", "jio"]);
    
    // If no relevant results, try alternate queries
    if (!relianceArticle) {
      console.log("[auto-briefing] No Reliance found in primary query, trying alternates...");
      
      const alternateQueries = [
        "Jio 5G India",
        "Reliance Industries news",
        "Mukesh Ambani Reliance",
      ];
      
      for (const query of alternateQueries) {
        relianceRes = await fetchEverythingOrRss(apiKey, query, {
          pageSize: 5,
          language: "en",
        });
        relianceArticle = findRelevantArticle(relianceRes.articles, ["reliance", "jio"]);
        if (relianceArticle) {
          console.log(`[auto-briefing] Found Reliance article with query: ${query}`);
          break;
        }
      }
    }

    if (relianceArticle) {
      sources.push({
        type: "url",
        value: relianceArticle.url,
        title: relianceArticle.title,
        briefing_section: "Reliance News",
      });
      console.log("[auto-briefing] ✓ Reliance:", relianceArticle.title);
    } else {
      console.warn("[auto-briefing] ✗ No Reliance/Jio news found");
    }

    // STEP 2: Fetch Maharashtra news with validation
    console.log("[auto-briefing] Fetching Maharashtra news...");
    const maharashtraRes = await fetchEverythingOrRss(apiKey, "Maharashtra Mumbai India", {
      pageSize: 5,
      language: "en",
    });
    
    const maharashtraArticle = findRelevantArticle(maharashtraRes.articles, ["maharashtra", "mumbai"]);
    
    if (maharashtraArticle) {
      sources.push({
        type: "url",
        value: maharashtraArticle.url,
        title: maharashtraArticle.title,
        briefing_section: "Maharashtra",
      });
      console.log("[auto-briefing] ✓ Maharashtra:", maharashtraArticle.title);
    } else {
      console.warn("[auto-briefing] ✗ No Maharashtra news found");
    }

    // STEP 3: Fetch Pan India news
    console.log("[auto-briefing] Fetching Pan India news...");
    const indiaRes = await fetchEverythingOrRss(apiKey, "India business technology economy", {
      pageSize: 5,
      language: "en",
    });
    
    // For Pan India, be less strict - just need India-related
    const indiaArticle = indiaRes.articles.length > 0 ? indiaRes.articles[0] : null;
    
    if (indiaArticle) {
      sources.push({
        type: "url",
        value: indiaArticle.url,
        title: indiaArticle.title,
        briefing_section: "Pan India",
      });
      console.log("[auto-briefing] ✓ Pan India:", indiaArticle.title);
    } else {
      console.warn("[auto-briefing] ✗ No Pan India news found");
    }

    if (sources.length === 0) {
      return NextResponse.json(
        { error: "No relevant news articles found. Try again in a few minutes." },
        { status: 404 }
      );
    }

    console.log(`[auto-briefing] Total sources found: ${sources.length}`);
    
    if (sources.length < 3) {
      console.warn(`[auto-briefing] Warning: Only ${sources.length}/3 stories found`);
    }

    // Create briefing with Sarvam AI as default
    const briefingId = await createBriefing(sources, "sarvam", "en");
    if (!briefingId) {
      return NextResponse.json(
        { error: "Failed to create briefing" },
        { status: 500 }
      );
    }

    // Process the briefing
    const useQueue = isQueueAvailable();
    if (useQueue) {
      await briefingQueue.add("pipeline", { briefingId });
      return NextResponse.json({ briefingId, queued: true, sections: sources.length });
    } else {
      // Run pipeline directly (no await - let it run in background)
      runPipeline(briefingId).catch((e) =>
        console.error("[auto-briefing] pipeline error", briefingId, e)
      );
      return NextResponse.json({ briefingId, queued: false, sections: sources.length });
    }
  } catch (e) {
    console.error("[auto-briefing] error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
