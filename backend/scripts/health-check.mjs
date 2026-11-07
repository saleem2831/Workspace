const base = (process.env.BACKEND_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
for (const path of ['/api/health', '/api/ready']) {
  try {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(5000) });
    console.log(`${response.status} ${base}${path}`, await response.text());
    if (!response.ok) process.exitCode = 1;
  } catch (e) { console.error(`FAIL ${path}:`, e.message); process.exitCode = 1; }
}
