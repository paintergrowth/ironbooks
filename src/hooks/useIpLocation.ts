// src/hooks/useIpLocation.ts
import { useEffect, useState } from 'react';

type IpLocation = {
  city?: string;
  region?: string;   // state / province
  country?: string;  // full name, e.g. "United States"
};

type Status = 'idle' | 'loading' | 'success' | 'error';

// simple in-memory cache so we don't refetch the same IP
const ipLocationCache = new Map<string, IpLocation>();

export function useIpLocation(ip?: string | null) {
  const [location, setLocation] = useState<IpLocation | null>(null);
  const [status, setStatus] = useState<Status>('idle');

  useEffect(() => {
    if (!ip) {
      setLocation(null);
      setStatus('idle');
      return;
    }

    // if we already fetched this IP in this session, reuse it
    if (ipLocationCache.has(ip)) {
      setLocation(ipLocationCache.get(ip)!);
      setStatus('success');
      return;
    }

    let cancelled = false;
    setStatus('loading');

    (async () => {
      try {
        const res = await fetch(`https://ipapi.co/${ip}/json/`);
        const data = await res.json();

        if (cancelled) return;

        const loc: IpLocation = {
          city: data.city,
          region: data.region,
          country: data.country_name,
        };

        ipLocationCache.set(ip, loc);
        setLocation(loc);
        setStatus('success');
      } catch (e) {
        if (!cancelled) {
          console.error('Error fetching IP location', e);
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ip]);

  return { location, status };
}
