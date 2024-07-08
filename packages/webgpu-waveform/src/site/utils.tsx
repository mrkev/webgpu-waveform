import { useState } from "react";

type PromiseState<T> = ["resolved", T] | ["pending"] | ["rejected", unknown];
export function usePromise<T>(promise: () => Promise<T>) {
  const [value, setValue] = useState<PromiseState<T>>(() => {
    promise()
      .then((v) => setValue(["resolved", v]))
      .catch((e) => setValue(["rejected", e]));
    return ["pending"];
  });
  return value;
}

export const audioContext = new AudioContext();

export async function loadSound(
  audioContext: AudioContext,
  url: string
): Promise<AudioBuffer> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return audioContext.decodeAudioData(arrayBuffer);
}
