import { cosineSimilarity, embedMany } from "ai";
import { google } from "@ai-sdk/google";

const model = google.textEmbeddingModel('gemini-embedding-001')

const { embeddings, values, usage } = await embedMany({
    model,
    values: [
        'likes chocolates',
        'hates coffee',
        'works at Blue Altair',
        'is a software engineer',
    ],
    providerOptions: {
        google: {
            outputDimensionality: 128,
            taskType: 'RETRIEVAL_QUERY',
        }
    }
})

console.log('tokens:', usage.tokens)
for (let i = 0; i < embeddings.length; i++) {
    const sims = []
    for (let j = 0; j < values.length; j++) {
        sims.push(cosineSimilarity(embeddings[i]!, embeddings[j]!).toPrecision(2))
    }
    console.log(values[i], `\tEmbedding<${embeddings[i]?.length}>\t`, sims)
}