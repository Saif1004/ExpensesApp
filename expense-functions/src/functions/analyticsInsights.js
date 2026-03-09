const { app } = require("@azure/functions");
const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/v1`
});

app.http("analyticsInsights", {
  methods:["POST"],
  authLevel:"anonymous",

  handler: async (request)=>{

    const { stats } = await request.json();

    const prompt = `
Generate short insights from this expense data.

Total claims: ${stats.total}
Approved: ${stats.approved}
Rejected: ${stats.rejected}

Categories:
Meals ${stats.categories.Meals}
Travel ${stats.categories.Travel}
Technology ${stats.categories.Technology}
Office ${stats.categories.Office}

Average claim: £${stats.avgValue}

Write 2-3 short sentences of insights.
`;

    const res = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT,
      messages:[
        {role:"system",content:"You generate financial insights."},
        {role:"user",content:prompt}
      ],
      max_tokens:120
    });

    return {
      status:200,
      jsonBody:{
        insight: res.choices[0].message.content
      }
    };

  }
});