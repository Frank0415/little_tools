import { useState, useEffect } from "react";
import { checkHealth } from "../lib/api";

export function useHealth(interval: number = 5000) {
  const [isOnline, setIsOnline] = useState<boolean>(false);

  useEffect(() => {
    const check = async () => {
      const online = await checkHealth();
      setIsOnline(online);
    };

    check();
    const id = setInterval(check, interval);
    return () => clearInterval(id);
  }, [interval]);

  return isOnline;
}
