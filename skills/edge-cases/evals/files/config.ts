export const config = {
  openaiKey: process.env.OPENAI_API_KEY,
  bucket: process.env.RECORDINGS_BUCKET,
  apiBase: process.env.API_BASE ?? "http://localhost:3000",
};
