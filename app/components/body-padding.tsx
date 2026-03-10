"use client";

import { useAudioPlayer } from "./audio-player-provider";
import { useEffect, useState } from "react";

export default function BodyPadding() {
  const { isVisible } = useAudioPlayer();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      const body = document.body;
      if (isVisible) {
        body.classList.add('pb-20');
      } else {
        body.classList.remove('pb-20');
      }
    }
  }, [isVisible, mounted]);

  return null;
}
