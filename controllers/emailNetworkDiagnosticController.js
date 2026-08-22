const dns = require('node:dns').promises;
const net = require('node:net');

const CONNECTION_TIMEOUT_MS = 10000;
const SMTP_PORTS = [587, 465];

function resolveHost() {
  return String(process.env.SMTP_HOST || '').trim();
}

async function resolveDns(host) {
  const startedAt = process.hrtime.bigint();
  try {
    const addresses = await dns.lookup(host, { all: true });
    return {
      success: true,
      addresses: addresses.map(({ address, family }) => ({ address, family })),
      errorCode: null,
      timeout: false,
      elapsedMs: Number(process.hrtime.bigint() - startedAt) / 1e6
    };
  } catch (error) {
    return {
      success: false,
      addresses: [],
      errorCode: String(error?.code || 'DNS_RESOLUTION_FAILED'),
      timeout: error?.code === 'ETIMEDOUT',
      elapsedMs: Number(process.hrtime.bigint() - startedAt) / 1e6
    };
  }
}

function checkTcp(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const startedAt = process.hrtime.bigint();
    let settled = false;
    let timedOut = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        port,
        reachable: result.reachable,
        errorCode: result.errorCode,
        timeout: result.timeout,
        elapsedMs: Number(process.hrtime.bigint() - startedAt) / 1e6
      });
    };

    socket.setTimeout(CONNECTION_TIMEOUT_MS, () => {
      timedOut = true;
      finish({ reachable: false, errorCode: 'ETIMEDOUT', timeout: true });
    });
    socket.once('connect', () => finish({ reachable: true, errorCode: null, timeout: false }));
    socket.once('error', (error) => finish({
      reachable: false,
      errorCode: String(error?.code || 'TCP_CONNECTION_FAILED'),
      timeout: timedOut || error?.code === 'ETIMEDOUT'
    }));
    socket.connect(port, host);
  });
}

async function networkDiagnostic(req, res) {
  const host = resolveHost();
  if (!host) {
    return res.status(503).json({
      success: false,
      dns: { success: false, addresses: [], errorCode: 'SMTP_HOST_NOT_CONFIGURED', timeout: false, elapsedMs: 0 },
      tcp: SMTP_PORTS.map((port) => ({ port, reachable: false, errorCode: 'SMTP_HOST_NOT_CONFIGURED', timeout: false, elapsedMs: 0 }))
    });
  }

  const dnsResult = await resolveDns(host);
  const tcpResults = await Promise.all(SMTP_PORTS.map((port) => checkTcp(host, port)));
  const reachable = dnsResult.success && tcpResults.some((result) => result.reachable);

  return res.status(200).json({
    success: reachable,
    dns: dnsResult,
    tcp: tcpResults
  });
}

module.exports = { networkDiagnostic };