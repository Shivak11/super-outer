// Uploads a voice recording after the user stops recording.
export async function uploadRecording(fileUri: string, api: any) {
  const blob = await (await fetch(fileUri)).blob();
  const { url } = await api.post("/recordings/upload-url");
  await fetch(url, { method: "PUT", body: blob });
  await api.post("/recordings", { url });
}
