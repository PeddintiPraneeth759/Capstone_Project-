const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { StateGraph, START, END, Annotation } = require('@langchain/langgraph');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const Report = require('../models/Report');
const Road = require('../models/Road');

// Initialize Gemini
const llm = new ChatGoogleGenerativeAI({
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  temperature: 0,
  apiKey: process.env.GEMINI_API_KEY,
});

// Define the State
const JourneyState = Annotation.Root({
  origin: Annotation(),
  destination: Annotation(),
  routeOptions: Annotation(),
  trafficData: Annotation(),
  safetyData: Annotation(),
  communityData: Annotation(),
  finalRecommendation: Annotation(),
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
});

// --- Node Functions ---

async function routeAgent(state) {
  const prompt = `You are a Route Agent for an AI Mobility Platform. Generate 3 route options for a journey from "${state.origin}" to "${state.destination}".

  For each route, provide:
  - type: "fastest", "safest", or "eco"
  - distance: estimated km (number)
  - time: estimated minutes (number)
  - description: one-line route description

  Respond ONLY with a valid JSON array. Example:
  [{"type":"fastest","distance":15.2,"time":25,"description":"Via Main Highway"},{"type":"safest","distance":17.8,"time":32,"description":"Via Ring Road (fewer intersections)"},{"type":"eco","distance":16.5,"time":35,"description":"Via Outer Bypass (smooth roads)"}]`;

  const response = await llm.invoke([new SystemMessage(prompt)]);

  let routeOptions;
  try {
    const jsonMatch = response.content.match(/\[[\s\S]*\]/);
    routeOptions = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch (e) {
    routeOptions = null;
  }

  if (!routeOptions || routeOptions.length === 0) {
    routeOptions = [
      { type: 'fastest', distance: 18.2, time: 31, description: 'Via Main Road' },
      { type: 'safest', distance: 20.1, time: 35, description: 'Via Bypass Road' },
      { type: 'eco', distance: 19.5, time: 38, description: 'Via Outer Ring' }
    ];
  }

  return { routeOptions };
}

async function trafficAgent(state) {
  const prompt = `You are a Traffic AI Agent for an intelligent mobility platform. 
    Journey: ${state.origin} → ${state.destination}
    Routes available: ${JSON.stringify(state.routeOptions)}
    Current time: ${new Date().toLocaleTimeString()} on ${new Date().toLocaleDateString()}
    
    Analyze the likely traffic conditions for each route based on the time of day and route type.
    Include a prediction: "Traffic is expected to [increase/decrease/stay stable] in the next 30 minutes."
    
    Respond in 3-4 concise sentences.`;

  const response = await llm.invoke([new SystemMessage(prompt)]);
  return { trafficData: response.content };
}

async function safetyAgent(state) {
  // Fetch real community reports from the database
  let reportsContext = "No active hazard reports in the area.";
  try {
    const activeReports = await Report.find({
      status: 'verified',
      'confirmedBy.1': { $exists: true },
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    }).limit(10).lean();

    if (activeReports.length > 0) {
      const reportSummaries = activeReports.map(r =>
        `${r.type.replace('_', ' ')} at ${r.location?.address || `(${r.location?.lat}, ${r.location?.lng})`} — "${r.description}" (confidence: ${r.aiConfidence}%, ${r.upvotes} upvotes)`
      ).join('; ');
      reportsContext = `Active community reports (last 24h): ${reportSummaries}`;
    }
  } catch (err) {
    console.error('Safety agent DB error:', err.message);
  }

  const prompt = `You are a Safety AI Agent. Analyze safety conditions for routes from "${state.origin}" to "${state.destination}".

  Live community data: ${reportsContext}
  Routes: ${JSON.stringify(state.routeOptions)}

  Identify which routes may be affected by reported hazards. Rate the overall safety of each route.
  Respond in 2-3 concise sentences.`;

  const response = await llm.invoke([new SystemMessage(prompt)]);
  return { safetyData: response.content };
}

async function communityAgent(state) {
  // Fetch real road reputation data from the database
  let roadContext = "No road reputation data available.";
  try {
    const roads = await Road.find({}).sort({ avgRating: -1 }).limit(5).lean();
    if (roads.length > 0) {
      const roadSummaries = roads.map(r =>
        `${r.name}: Rating ${r.avgRating}/5 (Traffic: ${r.trafficLevel}, Quality: ${r.quality}/10)`
      ).join('; ');
      roadContext = `Road reputation data: ${roadSummaries}`;
    }
  } catch (err) {
    console.error('Community agent DB error:', err.message);
  }

  const prompt = `You are a Community Intelligence Agent. Analyze community feedback for the journey from "${state.origin}" to "${state.destination}".

  ${roadContext}
  Routes: ${JSON.stringify(state.routeOptions)}

  Recommend which route has the best community reputation and traveler feedback.
  Respond in 2-3 concise sentences.`;

  const response = await llm.invoke([new SystemMessage(prompt)]);
  return { communityData: response.content };
}

async function supervisorAgent(state) {
  const prompt = `
    You are the Supervisor Agent for an AI Mobility Network.
    Your job is to synthesize all agent reports and recommend the BEST route for the traveler.

    Journey: ${state.origin} → ${state.destination}
    
    Route Options: ${JSON.stringify(state.routeOptions)}
    
    Traffic Analysis: ${state.trafficData}
    
    Safety Analysis: ${state.safetyData}
    
    Community Intelligence: ${state.communityData}
    
    Based on ALL the above data, write a clear, friendly 3-5 sentence recommendation for the traveler.
    Start with which route you recommend and why. Mention any hazards to avoid and any time-saving tips.
  `;

  const response = await llm.invoke([new HumanMessage(prompt)]);
  return { finalRecommendation: response.content };
}

// --- Define the Graph ---
const workflow = new StateGraph(JourneyState)
  .addNode("routeAgent", routeAgent)
  .addNode("trafficAgent", trafficAgent)
  .addNode("safetyAgent", safetyAgent)
  .addNode("communityAgent", communityAgent)
  .addNode("supervisorAgent", supervisorAgent)
  
  // Parallel gathering of context after basic route is planned
  .addEdge(START, "routeAgent")
  .addEdge("routeAgent", "trafficAgent")
  .addEdge("routeAgent", "safetyAgent")
  .addEdge("routeAgent", "communityAgent")
  
  // All context feeds into supervisor
  .addEdge("trafficAgent", "supervisorAgent")
  .addEdge("safetyAgent", "supervisorAgent")
  .addEdge("communityAgent", "supervisorAgent")
  
  .addEdge("supervisorAgent", END);

// Compile the graph
const app = workflow.compile();

module.exports = { app };
