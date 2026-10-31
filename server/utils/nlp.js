/**
 * nlp.js
 * NLP Sentiment Analysis Client with graceful fallback.
 * 
 * Attempts to communicate with an external Python Flask sentiment microservice
 * (configured via NLP_SERVICE_URL, e.g. http://localhost:5001/sentiment).
 * If the service is unreachable or unconfigured, falls back to an internal
 * rule-based polarity classifier so feedback submission never fails.
 */

const POSITIVE_WORDS = new Set([
  'good', 'great', 'excellent', 'positive', 'beneficial', 'helpful', 'effective',
  'support', 'agree', 'satisfied', 'pleased', 'valuable', 'recommend', 'progressive',
  'fair', 'transparent', 'strong', 'flexible', 'favorable', 'optimistic', 'productive',
  'welcomed', 'smooth', 'appreciate', 'improvement', 'success', 'successful'
]);

const NEGATIVE_WORDS = new Set([
  'bad', 'poor', 'negative', 'concern', 'worried', 'disagree', 'unfair', 'unhelpful',
  'ineffective', 'oppose', 'dissatisfied', 'frustrated', 'problem', 'flawed', 'harmful',
  'restrictive', 'difficult', 'confusing', 'disappointed', 'complaint', 'risk',
  'failure', 'unrealistic', 'unacceptable', 'burden', 'struggle', 'issue'
]);

function classifyFallback(text = '') {
  if (!text || typeof text !== 'string') return 'NEUTRAL';
  const tokens = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  let score = 0;

  for (const token of tokens) {
    if (POSITIVE_WORDS.has(token)) score++;
    if (NEGATIVE_WORDS.has(token)) score--;
  }

  if (score > 0) return 'POSITIVE';
  if (score < 0) return 'NEGATIVE';
  return 'NEUTRAL';
}

/**
 * Classify the sentiment of an open-ended text response.
 * @param {string} text - The stakeholder's open-ended answer text.
 * @returns {Promise<{ sentiment: 'POSITIVE'|'NEGATIVE'|'NEUTRAL'|null, status: 'COMPLETED'|'PENDING'|'FAILED' }>}
 */
export async function analyzeSentiment(text) {
  if (!text || typeof text !== 'string') {
    return { sentiment: null, status: 'NOT_APPLICABLE' };
  }

  const nlpServiceUrl = process.env.NLP_SERVICE_URL || 'http://localhost:5001/sentiment';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(nlpServiceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, feedback: text }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const raw = (data.sentiment || data.label || data.classification || '').toUpperCase();
      let normalized = 'NEUTRAL';
      if (raw.includes('POS')) normalized = 'POSITIVE';
      else if (raw.includes('NEG')) normalized = 'NEGATIVE';

      return {
        sentiment: normalized,
        status: 'COMPLETED',
      };
    }
  } catch (err) {
    // External NLP service is not running or timed out.
    // As per specification: completion of feedback submission must NOT depend on NLP service being available.
  }

  // Graceful fallback to local rule-based polarity classification
  try {
    const fallbackSentiment = classifyFallback(text);
    return {
      sentiment: fallbackSentiment,
      status: 'COMPLETED',
    };
  } catch (err) {
    return {
      sentiment: null,
      status: 'FAILED',
    };
  }
}

export default {
  analyzeSentiment,
};

