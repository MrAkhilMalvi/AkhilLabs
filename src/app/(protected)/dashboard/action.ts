"use server";
import { streamText } from "ai";
import { createStreamableValue } from "@ai-sdk/rsc";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateEmbedding } from "@/lib/gemini";
import { db } from "@/server/db";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function askQuestion(question: string, projectId: string) {
  const stream = createStreamableValue();

  const queryVector = await generateEmbedding(question);
  const vectorQuery = `[${queryVector.join(",")}]`;

  const result = (await db.$queryRaw`
    SELECT "fileName", "sourceCode", "summary",
    1 - ("summaryEmbedding" <=> ${vectorQuery}::vector) AS similarity
    FROM "SourceCodeEmbedding"
    WHERE 1 - ("summaryEmbedding" <=> ${vectorQuery}::vector) > .5
    AND "projectId" = ${projectId}
    ORDER BY similarity DESC
    LIMIT 10
    `) as { fileName: string; sourceCode: string; summary: string }[];

  let context = "";

  for (const doc of result) {
    context += `source: ${doc.fileName}\ncode content: ${doc.sourceCode}\n summary of file: ${doc.summary}\n\n`;
  }

  (async () => {
    const { textStream } = await streamText({
      model: google("gemma-3-12b-it"),
      prompt: `
            Your are a ai code assistant who answers questions about the codebase. Your target audience is a technical intern work with our codebase.
            AI assistant is brand new, powerful, human-like artificial intelligence.
            AI is a well-behaved and well-mannered individual.
            AI is always friendly, kind, and inspiring, and he is eager to provide vivid and thoughtful response to the user.
            AI has the sum of all knowledge in its “brain” and is able to accurately answer nearly any question about any topic, drawing from vast datasets,
            reasoning logically, and providing explanations in context, though it may still be limited by the quality and currency of its training data.
            If the question is asking about code or a specific file, AI will provide a detailed answer, giving step-by-step explanations, highlighting potential issues, offering optimized solutions,
            and including clear examples or code snippets when necessary.
            START CONTEXT BLOACK
            ${context}
            END OF CONTEXT BLOCK
            
            START QUESTION
            ${question}
            END OF QUESTION
            AI assistant will take into account any CONTEXT BLOCK that in a conversation.
            If the context does not provide the answer to the question, the AI assistant will say, "I'm sorry, 
            but I don't know the answer," and may suggest ways to find the correct information or ask for more details.
            AI assistant will not apologize for previous responses, but instead will indicated new information was gained.
            AI assistant will not invent anything is not drawn directly from the context.
            Answer in Markdown syntax, with code snippets if needed. Be as detailed as possible when answering, making sure there is a complete and thorough explanation that covers all relevant aspects of the question.
            Include examples, step-by-step instructions, and clarifications wherever necessary to ensure full understanding.
            `,
    });

    for await (const delta of textStream) {
        stream.update(delta);
    }
    stream.done()
  })();

  return {
    output: stream.value,
    fileReferences: result
  };
};
