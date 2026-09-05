export function fitNarration(totalSpeech: number, targetDuration: number, sceneCount: number) {
  if (!Number.isFinite(totalSpeech) || totalSpeech <= 0 || !Number.isFinite(targetDuration) || sceneCount < 1) throw new Error("Invalid narration timing");
  const desiredSpeech = targetDuration - sceneCount * 0.7;
  const tempo = Math.max(0.8, totalSpeech / desiredSpeech);
  const holdSeconds = (targetDuration - totalSpeech / tempo) / sceneCount;
  if (tempo > 1.25 || holdSeconds > 2.5 || holdSeconds < 0.69) throw new Error("Narration duration is outside the safe timing adjustment range");
  return { tempo, holdSeconds };
}
