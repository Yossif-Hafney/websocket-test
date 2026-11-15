/**
 * Practice WebSocket server — simulates a crypto wallet backend.
 *
 * Patterns demonstrated (same ones you'll need in the real project):
 *  - per-client subscription to channels (deposit / withdraw / stake / logs)
 *  - server-initiated push events (broadcast to subscribers only)
 *  - client-initiated actions that produce events
 *  - ping/pong you can use to detect dead connections
 *  - structured message envelope: { type, payload, ts }
 *
 * Run:  node server.js
 */

const { WebSocketServer, WebSocket } = require('ws');
const { randomUUID } = require('crypto');

const PORT = process.env.PORT || 8000;
const wss = new WebSocketServer({ port: PORT });

const CHANNELS = [
  'deposit',
  'withdraw',
  'stake',
  'logs',
  'wallet',
  'walletAddresses',
  'walletTransactions',
  'walletVolumes',
  'overviewBalances',
  'assetBalances',
  'transactionHistory',
];

// ws -> { id, subscriptions: Set<string>, balance: number, alive: boolean }
const clients = new Map();

function send(ws, type, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload, ts: Date.now() }));
  }
}

function sendEvent(ws, channel, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'event', channel, payload, ts: Date.now() }));
  }
}

function broadcastToChannel(channel, payload) {
  for (const [ws, meta] of clients) {
    if (meta.subscriptions.has(channel)) {
      sendEvent(ws, channel, payload);
    }
  }
}

wss.on('connection', (ws) => {
  const id = randomUUID();
  const walletData = createWalletData();
  const meta = { id, ws, subscriptions: new Set(), balance: walletData.totalBalance, alive: true, walletData };
  clients.set(ws, meta);
  console.log(`[+] client connected: ${id}`);

  send(ws, 'connected', { clientId: id, balance: walletData.totalBalance });
  sendEvent(ws, 'wallet', { asset: 'BTC', balance: walletData.totalBalance });
  sendEvent(ws, 'walletAddresses', walletData.addresses);
  sendEvent(ws, 'walletTransactions', walletData.transactions);
  sendEvent(ws, 'walletVolumes', walletData.volumes);
  sendEvent(ws, 'overviewBalances', walletData.overviewBalances);
  sendEvent(ws, 'assetBalances', walletData.assetBalances);
  sendEvent(ws, 'transactionHistory', walletData.transactionHistory);

  const updateTimer = setInterval(() => {
    if (!clients.has(ws)) return;
    tickWalletData(meta);
  }, 5000);

  ws.on('pong', () => {
    const meta = clients.get(ws);
    if (meta) meta.alive = true;
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, 'error', { message: 'invalid json' });
    }

    const meta = clients.get(ws);
    if (!meta) return;

    switch (msg.type) {
      case 'subscribe': {
        if (!CHANNELS.includes(msg.channel)) {
          return send(ws, 'error', { message: `unknown channel: ${msg.channel}` });
        }
        meta.subscriptions.add(msg.channel);
        send(ws, 'subscribed', { channel: msg.channel });
        sendInitialChannelData(ws, msg.channel, meta.walletData);
        break;
      }
      case 'unsubscribe': {
        meta.subscriptions.delete(msg.channel);
        send(ws, 'unsubscribed', { channel: msg.channel });
        break;
      }
      case 'ping': {
        send(ws, 'pong', {});
        break;
      }
      case 'action': {
        handleAction(ws, meta, msg);
        break;
      }
      default:
        send(ws, 'error', { message: `unknown message type: ${msg.type}` });
    }
  });

  ws.on('close', () => {
    console.log(`[-] client disconnected: ${id}`);
    clearInterval(updateTimer);
    clients.delete(ws);
  });

  ws.on('error', (err) => {
    console.error(`ws error (${id}):`, err.message);
  });
});

function sendInitialChannelData(ws, channel, walletData) {
  switch (channel) {
    case 'wallet':
      sendEvent(ws, 'wallet', { asset: 'BTC', balance: walletData.totalBalance });
      break;
    case 'walletAddresses':
      sendEvent(ws, 'walletAddresses', walletData.addresses);
      break;
    case 'walletTransactions':
      sendEvent(ws, 'walletTransactions', walletData.transactions);
      break;
    case 'walletVolumes':
      sendEvent(ws, 'walletVolumes', walletData.volumes);
      break;
    case 'overviewBalances':
      sendEvent(ws, 'overviewBalances', walletData.overviewBalances);
      break;
    case 'assetBalances':
      sendEvent(ws, 'assetBalances', walletData.assetBalances);
      break;
    case 'transactionHistory':
      sendEvent(ws, 'transactionHistory', walletData.transactionHistory);
      break;
    default:
      break;
  }
}

function createWalletData() {
  const addresses = [
    { name: 'MetaMask', address: randomAddress() },
    { name: 'Ledger', address: randomAddress() },
  ];

  const assets = [
    {
      icon: 'https://cryptologos.cc/logos/bitcoin-btc-logo.svg?v=014',
      symbol: 'BTC',
      name: 'Bitcoin',
      unit: 'BTC',
      price: randomFloat(30000, 40000, 2),
      holding: randomFloat(1.5, 3.5, 2),
    },
    {
      icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=014',
      symbol: 'ETH',
      name: 'Ethereum',
      unit: 'ETH',
      price: randomFloat(1400, 2000, 2),
      holding: randomFloat(5, 15, 2),
    },
    {
      icon: 'https://cryptologos.cc/logos/cardano-ada-logo.svg?v=014',
      symbol: 'ADA',
      name: 'Cardano',
      unit: 'ADA',
      price: randomFloat(0.25, 0.5, 2),
      holding: randomFloat(8000, 15000, 0),
    },
  ];

  const overviewBalances = assets.map((asset) => ({
    icon: asset.icon,
    symbol: asset.symbol,
    name: asset.name,
    amount: `${asset.holding.toFixed(asset.symbol === 'ADA' ? 0 : 2)} ${asset.unit}`,
    value: formatCurrency(asset.price * asset.holding),
  }));

  const assetBalances = assets.map((asset) => {
    const delta = randomFloat(-0.05, 0.1, 3);
    const value = asset.price * asset.holding;
    return {
      icon: asset.icon,
      symbol: asset.symbol,
      name: asset.name,
      price: formatCurrency(asset.price),
      holding: `${asset.holding.toFixed(asset.symbol === 'ADA' ? 0 : 2)} ${asset.unit}`,
      value: formatCurrency(value),
      change: `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`,
      isPositive: delta >= 0,
    };
  });

  const transactions = Array.from({ length: 3 }, () => randomTransaction());
  const transactionHistory = Array.from({ length: 3 }, () => ({ ...randomTransaction(true), txId: `TX-${randomInt(2024, 2025)}-${randomInt(1000, 9999)}` }));

  return {
    totalBalance: Number(overviewBalances.reduce((sum, item) => sum + Number(item.value.replace(/[$,]/g, '')), 0).toFixed(2)),
    addresses,
    transactions,
    volumes: [
      { label: 'Deposit Volume', value: formatCurrency(randomFloat(500000, 1400000, 0)), category: 'deposit' },
      { label: 'Withdrawal Volume', value: formatCurrency(randomFloat(200000, 1000000, 0)), category: 'withdrawal' },
      { label: 'Net Volume', value: formatCurrency(randomFloat(100000, 400000, 0)), category: 'net' },
      { label: 'Fees Volume', value: formatCurrency(randomFloat(2500, 9000, 0)), category: 'fee' },
    ],
    overviewBalances,
    assetBalances,
    transactionHistory,
  };
}

function randomFloat(min, max, decimals = 2) {
  const value = Math.random() * (max - min) + min;
  return Number(value.toFixed(decimals));
}

function formatCurrency(value) {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function randomAddress() {
  const hex = Array.from({ length: 8 }, () => randomInt(0, 15).toString(16)).join('');
  return `0x${hex.slice(0, 4)}...${hex.slice(-4)}`;
}

function randomTransaction(isHistory = false) {
  const kinds = [
    { type: 'Deposit', asset: 'Bitcoin', symbol: 'BTC', icon: 'https://cryptologos.cc/logos/bitcoin-btc-logo.svg?v=014' },
    { type: 'Withdrawal', asset: 'Bitcoin', symbol: 'BTC', icon: 'https://cryptologos.cc/logos/bitcoin-btc-logo.svg?v=014' },
    { type: 'Stake', asset: 'Ethereum', symbol: 'ETH', icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=014' },
  ];
  const kind = kinds[randomInt(0, kinds.length - 1)];
  const amount = randomFloat(kind.symbol === 'ADA' ? 50 : 0.1, kind.symbol === 'ADA' ? 500 : 5, kind.symbol === 'ADA' ? 0 : 2);
  const prices = {
    BTC: randomFloat(30000, 40000, 2),
    ETH: randomFloat(1400, 2000, 2),
  };
  const unitPrice = prices[kind.symbol] || 1;
  const valueRaw = Number((amount * unitPrice).toFixed(2));
  const value = formatCurrency(valueRaw);
  const feeRaw = Number(randomFloat(0.1, 25, 2));
  const fee = formatCurrency(feeRaw);
  const status = ['Completed', 'Pending', 'Failed'][randomInt(0, 2)];
  const networkName = kind.asset;
  return {
    icon: kind.icon,
    asset: kind.asset,
    symbol: kind.symbol,
    type: kind.type,
    amount: `${amount.toFixed(kind.symbol === 'ADA' ? 0 : 2)} ${kind.symbol}`,
    // numeric and formatted values separated for clarity in the client
    value: value,
    valueRaw,
    walletValue: valueRaw,
    fee: feeRaw,
    networkFee: feeRaw,
    feeFormatted: fee,
    networkFeeFormatted: fee,
    date: randomDate(),
    status,
    isPositive: kind.type !== 'Withdrawal',
    network: networkName,
    txId: isHistory ? `TX-${Date.now()}-${randomInt(1000, 9999)}` : `TX-${Date.now()}-${randomInt(1000, 9999)}`,
  };
}

function randomDate() {
  const date = new Date(Date.now() - randomInt(0, 14) * 24 * 60 * 60 * 1000);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function createTransaction(type, amount, isPositive, status = 'Completed') {
  const base = {
    icon: 'https://cryptologos.cc/logos/bitcoin-btc-logo.svg?v=014',
    asset: 'Bitcoin',
    symbol: 'BTC',
    amount: `${amount.toFixed(2)} BTC`,
    // compute value and fee numerically so client can display them cleanly
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    status,
    isPositive,
  };
  // approximate unit prices for formatting
  const prices = { BTC: randomFloat(30000, 40000, 2), ETH: randomFloat(1400, 2000, 2) };
  const unitPrice = prices[base.symbol] || prices.BTC;
  const valueRaw = Number((amount * unitPrice).toFixed(2));
  const value = formatCurrency(valueRaw);
  const feeRaw = Number(randomFloat(0.1, 25, 2));
  const feeFormatted = formatCurrency(feeRaw);

  const network = type === 'Stake' ? 'Ethereum' : 'Bitcoin';
  const result = {
    ...base,
    type,
    asset: network,
    symbol: type === 'Stake' ? 'ETH' : 'BTC',
    network,
    value,
    valueRaw,
    walletValue: valueRaw,
    fee: feeRaw,
    networkFee: feeRaw,
    feeFormatted,
    networkFeeFormatted: feeFormatted,
    txId: `TX-${Date.now()}-${randomInt(1000, 9999)}`,
  };

  if (type === 'Stake') {
    result.icon = 'https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=014';
  }

  return result;
}

// Update a transaction's status and optional extra fields in both lists
function updateTransactionStatus(meta, txId, newStatus, extra = {}) {
  if (!meta || !meta.walletData) return;
  const lists = [meta.walletData.transactions, meta.walletData.transactionHistory];
  for (const list of lists) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].txId === txId) {
        list[i] = { ...list[i], status: newStatus, ...extra };
      }
    }
  }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function tickWalletData(meta) {
  if (!meta) return;

  // mutate balances slightly
  const change = (Math.random() - 0.5) * 50;
  meta.walletData.totalBalance = Math.max(0, Math.round((meta.walletData.totalBalance + change) * 100) / 100);
  if (meta.walletData.volumes) {
    meta.walletData.volumes = meta.walletData.volumes.map((item) => ({
      ...item,
      value: `$${(Number(item.value.replace(/[$,]/g, '')) + randomInt(-5000, 5000)).toLocaleString()}`,
    }));
  }

  meta.walletData.overviewBalances = meta.walletData.overviewBalances.map((item) => {
    const baseValue = Number(item.value.replace(/[$,]/g, ''));
    const newValue = Math.max(100, baseValue + randomInt(-2000, 2000));
    return {
      ...item,
      amount: item.amount.replace(/^[0-9.]+/, (match) => `${Math.max(0.1, Number(match) + randomInt(-2, 2)).toFixed(2)}`),
      value: `$${newValue.toLocaleString()}`,
    };
  });

  meta.walletData.assetBalances = meta.walletData.assetBalances.map((item) => {
    const baseValue = Number(item.value.replace(/[$,]/g, ''));
    const delta = randomInt(-1500, 1500);
    const isPositive = delta >= 0;
    return {
      ...item,
      value: `$${Math.max(10, baseValue + delta).toLocaleString()}`,
      change: `${isPositive ? '+' : ''}${(delta / Math.max(1, baseValue) * 100).toFixed(1)}%`,
      isPositive,
    };
  });

  if (meta.walletData.transactionHistory.length > 0) {
    meta.walletData.transactionHistory = meta.walletData.transactionHistory.map((item) => ({
      ...item,
      value: `$${Math.max(100, Number(item.value.replace(/[$,]/g, '')) + randomInt(-500, 500)).toLocaleString()}`,
    }));
  }

  if (meta.subscriptions.has('wallet')) {
    sendEvent(meta.ws, 'wallet', { asset: 'BTC', balance: meta.walletData.totalBalance });
  }
  if (meta.subscriptions.has('walletAddresses')) {
    meta.walletData.addresses = meta.walletData.addresses.map((address) => ({
      ...address,
      address: `${address.address.slice(0, 6)}...${randomInt(1000, 9999)}`,
    }));
    sendEvent(meta.ws, 'walletAddresses', meta.walletData.addresses);
  }
  if (meta.subscriptions.has('walletTransactions')) {
    const newTxn = createTransaction(
      ['Deposit', 'Withdrawal', 'Stake'][randomInt(0, 2)],
      randomInt(1, 50) / 10,
      Math.random() > 0.5
    );
    meta.walletData.transactions = [newTxn, ...meta.walletData.transactions].slice(0, 6);
    sendEvent(meta.ws, 'walletTransactions', meta.walletData.transactions);
  }
  if (meta.subscriptions.has('walletVolumes')) {
    sendEvent(meta.ws, 'walletVolumes', meta.walletData.volumes);
  }
  if (meta.subscriptions.has('overviewBalances')) {
    sendEvent(meta.ws, 'overviewBalances', meta.walletData.overviewBalances);
  }
  if (meta.subscriptions.has('assetBalances')) {
    sendEvent(meta.ws, 'assetBalances', meta.walletData.assetBalances);
  }
  if (meta.subscriptions.has('transactionHistory')) {
    sendEvent(meta.ws, 'transactionHistory', meta.walletData.transactionHistory);
  }
}

function handleAction(ws, meta, msg) {
  const { action, amount } = msg.payload || {};
  const numAmount = Number(amount) || 0;

  // simulate network/chain latency, like a real deposit/withdraw would have
  const delay = 400 + Math.random() * 800;

  if (action === 'deposit') {
    sendEvent(ws, 'logs', { message: `Deposit of ${numAmount} submitted`, level: 'info' });
    // create a pending transaction immediately
    const pendingDep = createTransaction('Deposit', numAmount, true, 'Pending');
    meta.walletData.transactions.unshift(pendingDep);
    meta.walletData.transactionHistory.unshift({ ...pendingDep });
    broadcastToChannel('walletTransactions', meta.walletData.transactions);
    broadcastToChannel('transactionHistory', meta.walletData.transactionHistory);

    setTimeout(() => {
      // decide outcome
      const success = Math.random() < 0.9; // 90% chance succeed
      if (success) {
        meta.balance += numAmount;
        meta.walletData.totalBalance = meta.balance;
        updateTransactionStatus(meta, pendingDep.txId, 'Completed');
        broadcastToChannel('wallet', { asset: 'BTC', balance: meta.balance });
        broadcastToChannel('walletVolumes', meta.walletData.volumes);
        broadcastToChannel('deposit', { id: randomUUID(), amount: numAmount, balance: meta.balance, status: 'confirmed' });
        broadcastToChannel('logs', { message: `Deposit of ${numAmount} confirmed`, level: 'success' });
      } else {
        updateTransactionStatus(meta, pendingDep.txId, 'Failed');
        broadcastToChannel('logs', { message: `Deposit of ${numAmount} failed`, level: 'error' });
      }
      broadcastToChannel('walletTransactions', meta.walletData.transactions);
      broadcastToChannel('transactionHistory', meta.walletData.transactionHistory);
    }, delay);
  } else if (action === 'withdraw') {
    if (numAmount > meta.balance) {
      return sendEvent(ws, 'logs', { message: 'Withdraw failed: insufficient balance', level: 'error' });
    }
    sendEvent(ws, 'logs', { message: `Withdraw of ${numAmount} submitted`, level: 'info' });
    const pendingW = createTransaction('Withdrawal', numAmount, false, 'Pending');
    meta.walletData.transactions.unshift(pendingW);
    meta.walletData.transactionHistory.unshift({ ...pendingW });
    broadcastToChannel('walletTransactions', meta.walletData.transactions);
    broadcastToChannel('transactionHistory', meta.walletData.transactionHistory);

    setTimeout(() => {
      const success = Math.random() < 0.8; // 80% chance succeed
      if (success) {
        meta.balance -= numAmount;
        meta.walletData.totalBalance = meta.balance;
        updateTransactionStatus(meta, pendingW.txId, 'Completed');
        broadcastToChannel('wallet', { asset: 'BTC', balance: meta.balance });
        broadcastToChannel('walletVolumes', meta.walletData.volumes);
        broadcastToChannel('withdraw', { id: randomUUID(), amount: numAmount, balance: meta.balance, status: 'confirmed' });
        broadcastToChannel('logs', { message: `Withdraw of ${numAmount} confirmed`, level: 'success' });
      } else {
        updateTransactionStatus(meta, pendingW.txId, 'Failed');
        broadcastToChannel('logs', { message: `Withdraw of ${numAmount} failed`, level: 'error' });
      }
      broadcastToChannel('walletTransactions', meta.walletData.transactions);
      broadcastToChannel('transactionHistory', meta.walletData.transactionHistory);
    }, delay);
  } else if (action === 'stake') {
    sendEvent(ws, 'logs', { message: `Stake of ${numAmount} submitted`, level: 'info' });
    const pendingS = createTransaction('Stake', numAmount, true, 'Pending');
    meta.walletData.transactions.unshift(pendingS);
    meta.walletData.transactionHistory.unshift({ ...pendingS });
    broadcastToChannel('walletTransactions', meta.walletData.transactions);

    setTimeout(() => {
      const success = Math.random() < 0.9;
      if (success) {
        updateTransactionStatus(meta, pendingS.txId, 'Completed');
        broadcastToChannel('walletTransactions', meta.walletData.transactions);
        broadcastToChannel('stake', { id: randomUUID(), amount: numAmount, apr: 5.2, status: 'active' });
        broadcastToChannel('logs', { message: `Stake of ${numAmount} active`, level: 'success' });
      } else {
        updateTransactionStatus(meta, pendingS.txId, 'Failed');
        broadcastToChannel('logs', { message: `Stake of ${numAmount} failed`, level: 'error' });
      }
      broadcastToChannel('transactionHistory', meta.walletData.transactionHistory);
    }, delay);
  } else if (action === 'newTransaction' || action === 'newTransation') {
    // create or inject a new transaction (supports common typo 'newTransation')
    const txType = (msg.payload && (msg.payload.type || msg.payload.txType)) || 'Deposit';
    const amountVal = Number(msg.payload && msg.payload.amount) || 0;
    const isPositive = txType !== 'Withdrawal';

    sendEvent(ws, 'logs', { message: `${txType} of ${amountVal} submitted`, level: 'info' });
    if (txType === 'Withdrawal' && amountVal > meta.balance) {
      return sendEvent(ws, 'logs', { message: 'New transaction failed: insufficient balance', level: 'error' });
    }
    const pending = createTransaction(txType, amountVal, isPositive, 'Pending');
    meta.walletData.transactions.unshift(pending);
    meta.walletData.transactionHistory.unshift({ ...pending });
    broadcastToChannel('walletTransactions', meta.walletData.transactions);
    broadcastToChannel('transactionHistory', meta.walletData.transactionHistory);

    setTimeout(() => {
      const success = Math.random() < 0.85;
      if (success) {
        if (txType === 'Deposit') {
          meta.balance += amountVal;
          meta.walletData.totalBalance = meta.balance;
        } else if (txType === 'Withdrawal') {
          meta.balance -= amountVal;
          meta.walletData.totalBalance = meta.balance;
        }
        updateTransactionStatus(meta, pending.txId, 'Completed');
        broadcastToChannel('wallet', { asset: 'BTC', balance: meta.balance });
        broadcastToChannel('logs', { message: `${txType} of ${amountVal} processed`, level: 'success' });
      } else {
        updateTransactionStatus(meta, pending.txId, 'Failed');
        broadcastToChannel('logs', { message: `${txType} of ${amountVal} failed`, level: 'error' });
      }
      broadcastToChannel('walletTransactions', meta.walletData.transactions);
      broadcastToChannel('transactionHistory', meta.walletData.transactionHistory);
    }, delay);
  } else {
    send(ws, 'error', { message: `unknown action: ${action}` });
  }
}

// heartbeat: detect dead connections (same idea you'll want in prod)
const heartbeat = setInterval(() => {
  for (const [ws, meta] of clients) {
    if (!meta.alive) {
      console.log(`[x] terminating dead client: ${meta.id}`);
      ws.terminate();
      clients.delete(ws);
      continue;
    }
    meta.alive = false;
    ws.ping();
  }
}, 30000);



wss.on('close', () => clearInterval(heartbeat));

console.log(`WS practice server running on ws://localhost:${PORT}`);
console.log(`Available channels: ${CHANNELS.join(', ')}`);