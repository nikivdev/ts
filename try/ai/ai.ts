import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { streamText } from "ai"

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

export async function tryAiSdk() {
  const prompt = "time in sf now"
  try {
    const { textStream } = streamText({
      model: openrouter("google/gemini-2.5-flash-preview-09-2025"),
      prompt,
    })

    console.log(`Prompt: ${prompt}`)
    for await (const chunk of textStream) {
      process.stdout.write(chunk)
    }
    console.log("\nStream complete!")
  } catch (error) {
    console.error("Stream request failed:", error)
  }
}
