/**
 * PotentSim Persona & Response Synthesis Engine
 * Generates realistic, non-redundant, role-aligned feedback via AI (Gemini) or Smart Offline Contextual Templates.
 */

export const ARCHETYPES = [
  {
    id: 'OPTIMIST',
    name: 'Progressive Innovator',
    badge: 'Optimistic & Forward-Looking',
    color: '#16a34a',
    bg: 'rgba(22, 163, 74, 0.1)',
    description: 'Enthusiastic about institutional progress, modern workflows, flexibility, and proactive adoption.',
    preferredRating: 5,
  },
  {
    id: 'PRAGMATIST',
    name: 'Pragmatic Realist',
    badge: 'Operational & Feasibility Minded',
    color: '#d97706',
    bg: 'rgba(217, 119, 6, 0.1)',
    description: 'Focuses on day-to-day workload, realistic delivery milestones, shift handoffs, and operational bottlenecks.',
    preferredRating: 3,
  },
  {
    id: 'GOVERNANCE',
    name: 'Governance Guardian',
    badge: 'Policy & Transparency Minded',
    color: '#6366f1',
    bg: 'rgba(99, 102, 241, 0.1)',
    description: 'Prioritizes compliance integrity, clear escalation pathways, data confidentiality, and standardized SOPs.',
    preferredRating: 4,
  },
  {
    id: 'RESOURCE',
    name: 'Resource Champion',
    badge: 'Tooling & Capacity Focused',
    color: '#0284c7',
    bg: 'rgba(2, 132, 199, 0.1)',
    description: 'Advocates for adequate hardware/software tooling, team bandwidth, dedicated training hours, and support staff.',
    preferredRating: 4,
  },
  {
    id: 'LEARNER',
    name: 'Growth & Mentorship Seeker',
    badge: 'Early Career & Learning Focused',
    color: '#ec4899',
    bg: 'rgba(236, 72, 153, 0.1)',
    description: 'Cares deeply about peer collaboration, spontaneous guidance from senior leaders, and accessible documentation.',
    preferredRating: 4,
  },
];

/**
 * Deterministically assigns an archetype to a stakeholder based on their attributes
 */
export function assignStakeholderPersona(stakeholder, index = 0) {
  if (!stakeholder) return ARCHETYPES[0];

  const category = (stakeholder.category || '').toLowerCase();
  const designation = (stakeholder.designation || '').toLowerCase();
  const department = (stakeholder.department || '').toLowerCase();

  if (category.includes('student') || designation.includes('trainee') || designation.includes('intern')) {
    return ARCHETYPES.find(a => a.id === 'LEARNER') || ARCHETYPES[4];
  }
  if (category.includes('department head') || designation.includes('director') || department.includes('legal') || department.includes('governance')) {
    return ARCHETYPES.find(a => a.id === 'GOVERNANCE') || ARCHETYPES[2];
  }
  if (department.includes('finance') || department.includes('procurement') || category.includes('supplier')) {
    return ARCHETYPES.find(a => a.id === 'RESOURCE') || ARCHETYPES[3];
  }
  if (department.includes('operation') || designation.includes('manager')) {
    return ARCHETYPES.find(a => a.id === 'PRAGMATIST') || ARCHETYPES[1];
  }

  // Fallback to rotating deterministic distribution
  return ARCHETYPES[index % ARCHETYPES.length];
}

/**
 * Smart Offline Contextual Generator
 * Generates rich, authentic, multi-sentence feedback paragraphs based on question text and persona.
 */
export function generateOfflineAnswer(question, stakeholder, persona, campaign) {
  const qType = (question.questionType || 'TEXT').toUpperCase();
  const options = Array.isArray(question.options) ? question.options : [];
  const qText = (question.questionText || '').toLowerCase();
  const dept = stakeholder.department || 'General';
  const desig = stakeholder.designation || 'Member';
  const name = `${stakeholder.first_name || stakeholder.firstName || ''} ${stakeholder.last_name || stakeholder.lastName || ''}`.trim() || 'Stakeholder';

  // 1. RATING
  if (qType === 'RATING') {
    const min = question.minValue ?? 1;
    const max = question.maxValue ?? 5;
    let target = persona.preferredRating || 4;
    target = Math.max(min, Math.min(max, target));
    return target;
  }

  // 2. RADIO / DROPDOWN
  if (qType === 'RADIO' || qType === 'DROPDOWN') {
    if (options.length === 0) return 'Option 1';
    // Select option tailored to archetype
    if (persona.id === 'OPTIMIST') return options[0];
    if (persona.id === 'PRAGMATIST') return options[Math.min(1, options.length - 1)];
    if (persona.id === 'GOVERNANCE') return options[Math.min(2, options.length - 1)];
    const chosenIdx = Math.abs(name.length + dept.length) % options.length;
    return options[chosenIdx];
  }

  // 3. CHECKBOX
  if (qType === 'CHECKBOX') {
    if (options.length === 0) return [];
    if (options.length === 1) return options;
    if (options.length === 2) return [options[0]];
    // Pick 2 contextual options
    const pick1 = options[Math.abs(name.length) % options.length];
    const pick2 = options[(Math.abs(name.length) + 1) % options.length];
    return Array.from(new Set([pick1, pick2]));
  }

  // 4. OPEN TEXT (Contextual Synthesis - Mimicking authentic, everyday human workplace voice)
  const isSuggestionQ = /suggest|change|improve|recommend|different/i.test(qText);
  const isPositiveQ = /like|best|positive|good|work well/i.test(qText);
  const isConcernQ = /concern|frustrat|disappoint|challenge|bottleneck|worry|issue/i.test(qText);

  // Question-specific natural human responses
  if (isSuggestionQ) {
    const suggestions = [
      `I'd suggest keeping the rollout simple and testing it with one or two teams first. In ${dept}, having a 1-page quick reference sheet instead of a 20-page document would make a huge difference in how fast people adopt it.`,
      `My main recommendation is to give individual teams some flexibility on how they schedule their hours. As long as our core deliverables in ${dept} are met, allowing some room for personal schedules will keep morale high.`,
      `It would be really helpful to set up a quick informal feedback check after the first 30 days. That way we can iron out any small hiccups before things get set in stone.`,
      `I'd suggest making the approval process as lightweight as possible. Nobody wants to spend an hour filling out forms for routine requests; keeping it quick and digital will make everyone's life easier.`,
    ];
    const hash = Math.abs((stakeholder.id || 1) * 23 + (question.id || 1) * 11);
    return suggestions[hash % suggestions.length];
  }

  if (isPositiveQ) {
    const positives = [
      `What I like most is the trust and flexibility this gives us. It shows the organization is listening to what employees actually need, and it should definitely help balance work and life better in ${dept}.`,
      `The clarity on expectations is the best part. Previously, a lot of things were just unwritten rules, so having clear guidelines everyone can point to makes day-to-day decisions much easier.`,
      `Honestly, just having a clear direction is great. It feels modern and sensible, and I think it will help our team stay productive without burning out.`,
      `I appreciate that management took the time to consult us before making decisions. The overall direction feels right, especially around supporting flexible collaboration.`,
    ];
    const hash = Math.abs((stakeholder.id || 1) * 29 + (question.id || 1) * 13);
    return positives[hash % positives.length];
  }

  if (isConcernQ) {
    const concerns = [
      `My only real concern is around communication when people are working asynchronously. If we don't have clear norms for response times during the workday, things can easily fall through the cracks in ${dept}.`,
      `The main challenge will be making sure workloads stay fair. We need to ensure that people on-site don't end up absorbing extra tasks just because they are physically present in the office.`,
      `Sometimes the approval turnaround is just too slow. If we need a quick sign-off for a client or project deliverable, waiting several days holds everything up.`,
      `I worry a bit about junior staff and new joiners. It's much harder to ask for quick help over chat than turning around at a desk, so we need to make sure senior mentors are actively checking in.`,
    ];
    const hash = Math.abs((stakeholder.id || 1) * 37 + (question.id || 1) * 19);
    return concerns[hash % concerns.length];
  }

  // Archetype Persona Templates - Balanced human tone (professional yet personal)
  const templates = {
    OPTIMIST: [
      `I really like where this is heading. In ${dept}, having this kind of flexibility will make day-to-day collaboration much smoother and give a big boost to team morale. I'd love to see us test it out in a small pilot first so we can share quick wins with the rest of the company.`,
      `This is a welcome update and something our team has been hoping for. As a ${desig}, I think the clearest benefit is giving people more autonomy while keeping everyone aligned. As long as we keep communication open on Slack or Teams, it should work great.`,
      `Overall, I'm very positive about this change. It feels modern, fair, and sensible. My suggestion is to make sure we keep the rollout straightforward and celebrate team milestones early on.`,
    ],
    PRAGMATIST: [
      `The idea makes sense, but we need to think through the day-to-day logistics in ${dept}. My main concern is coverage during peak hours and making sure client handoffs don't get dropped. As long as each team can set their own core hours, it should be manageable.`,
      `I'm supportive of the goals, but a phased rollout would be much safer than flipping a switch overnight. In ${dept}, we have tight deadlines, so having a 2-week buffer to test workflows and iron out hiccups will save a lot of headaches.`,
      `It looks good on paper, but in practice, unexpected issues always pop up. It would really help to have a simple checklist and a clear person to contact if project timelines clash with administrative requirements.`,
    ],
    GOVERNANCE: [
      `I think this policy provides helpful structure, but we need to make sure the guidelines are crystal clear for everyone. Simple things like where files are stored and how sensitive info is handled need to be spelled out in plain English so nobody is left guessing.`,
      `Having consistent ground rules across departments is definitely overdue. From our perspective in ${dept}, I'd just recommend setting up a short quarterly check-in to review how things are going and make adjustments where needed.`,
      `The framework is solid. To make implementation smooth, I'd suggest sharing a quick FAQ sheet with real examples alongside the main policy so managers and team members know exactly what's expected.`,
    ],
    RESOURCE: [
      `I'm on board with the policy, but team members in ${dept} are going to need the right tools to do their jobs properly. Making sure laptops, software access, and secure connections are sorted out before launch is what will make or break this.`,
      `From our side, budget and equipment support will be key. If people are working remotely or adopting new tools, having quick IT support and a small budget for home office essentials will keep productivity high.`,
      `We support the direction, but leadership needs to account for team bandwidth during the initial rollout. A 1-hour walkthrough session and decent technical support would go a long way in helping everyone transition smoothly.`,
    ],
    LEARNER: [
      `As someone still growing in ${dept}, I really appreciate being asked for input. My only ask is that we make sure newer team members still have easy access to senior colleagues for quick questions and guidance, especially on remote days.`,
      `I like the proposed policy, but having good documentation and an open culture where we can ask for help without feeling awkward is really important. A buddy system or weekly informal drop-in hours would be awesome.`,
      `This looks very promising. Clear step-by-step guidance and supportive feedback from team leads will help junior members like myself stay confident and productive.`,
    ],
  };

  const pool = templates[persona.id] || templates.OPTIMIST;
  const hash = Math.abs((stakeholder.id || 1) * 31 + (question.id || 1) * 17);
  return pool[hash % pool.length];
}

/**
 * AI Response Generator (Google Gemini API)
 * Calls Gemini directly with a tailored role-play prompt for maximum realism.
 * Automatically falls back to generateOfflineAnswer if API key is invalid or request fails.
 */
export async function generateAIAnswer(apiKey, question, stakeholder, persona, campaign) {
  if (!apiKey || !apiKey.trim()) {
    return generateOfflineAnswer(question, stakeholder, persona, campaign);
  }

  const qType = (question.questionType || 'TEXT').toUpperCase();

  // Closed questions don't need heavy LLM tokens; handle them cleanly & consistently
  if (qType !== 'TEXT') {
    return generateOfflineAnswer(question, stakeholder, persona, campaign);
  }

  const prompt = `You are roleplaying as an authentic real human stakeholder participating in an internal workplace feedback consultation survey.

STAKEHOLDER PROFILE:
- Name: ${stakeholder.first_name || stakeholder.firstName || 'Colleague'}
- Department: ${stakeholder.department || 'General'}
- Job Role: ${stakeholder.designation || 'Team Member'}
- Organization: ${campaign.organisation_name || 'Our Company'}

CONSULTATION CONTEXT:
- Policy Title: "${campaign.title || 'Policy Consultation'}"
- Summary: "${campaign.description || 'Consultation on workplace policies and procedures.'}"

QUESTION TO ANSWER:
"${question.questionText}"

CRITICAL TONE & WRITING STYLE GUIDELINES:
1. Write like an actual human employee typing their honest thoughts into an office survey. Balance professionalism with a natural, personal workplace voice.
2. STRICTLY AVOID robotic corporate buzzwords and clichés such as:
   - "unambiguous governance thresholds"
   - "baseline standards"
   - "confidentiality provisions are explicitly articulated in the policy handbook"
   - "transparent reporting mechanisms will be critical to sustaining institutional trust"
   - "streamline inter-departmental collaboration"
   - "institutional maturity"
3. Use natural phrases like: "I really like...", "From our end in ${stakeholder.department || 'our team'}...", "My main concern is...", "Honestly, as long as...", "It would be great if..."
4. Keep it grounded, practical, and concise (2 to 3 sentences max).
5. Do NOT use quotation marks. Do NOT include greetings ("Hi") or sign-offs. Start directly with your feedback.`;

  try {
    const cleanKey = apiKey.trim();
    // Using gemini-1.5-flash for fastest latency & low cost
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${cleanKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8-second safety timeout

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 250,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[PotentSim AI] Gemini API returned HTTP ${res.status}. Falling back to offline template.`);
      return generateOfflineAnswer(question, stakeholder, persona, campaign);
    }

    const data = await res.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (candidateText && candidateText.trim().length >= 10) {
      let cleaned = candidateText.trim().replace(/^["']|["']$/g, '');
      return cleaned;
    }

    return generateOfflineAnswer(question, stakeholder, persona, campaign);
  } catch (err) {
    console.warn('[PotentSim AI] Gemini call failed or timed out. Using offline fallback:', err.message);
    return generateOfflineAnswer(question, stakeholder, persona, campaign);
  }
}

