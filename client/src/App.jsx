import { useCallback, useState } from 'react';
import { useWebSocket, useChannel } from './hooks/useWebSocket';
import { ConnectionStatus } from './lib/WebSocketClient';
import './App.css';

const WS_URL = 'ws://localhost:8000';

function App() {
  const { client, status, send } = useWebSocket(WS_URL);
  const [balance, setBalance] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [walletAddresses, setWalletAddresses] = useState([]);
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [walletVolumes, setWalletVolumes] = useState([]);
  const [overviewBalances, setOverviewBalances] = useState([]);
  const [assetBalances, setAssetBalances] = useState([]);
  const [transactionHistory, setTransactionHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [amount, setAmount] = useState(10);

  function pushLog(message, level) {
    setLogs((prev) => [{ id: crypto.randomUUID(), message, level, ts: Date.now() }, ...prev].slice(0, 30));
  }

  // one useChannel per channel — this is the pattern you'll repeat for
  // deposit / withdraw / stake / logs in the real project too.
  const onDeposit = useCallback((evt) => {
    setBalance(evt.balance);
    pushLog(`deposit confirmed: +${evt.amount} (balance ${evt.balance})`, 'success');
  }, []);
  const onWithdraw = useCallback((evt) => {
    setBalance(evt.balance);
    pushLog(`withdraw confirmed: -${evt.amount} (balance ${evt.balance})`, 'success');
  }, []);
  const onStake = useCallback((evt) => {
    pushLog(`stake active: ${evt.amount} @ ${evt.apr}% APR`, 'success');
  }, []);
  const onLog = useCallback((evt) => {
    pushLog(evt.message, evt.level);
  }, []);

  const onWallet = useCallback((evt) => {
    setWallet(evt);
    setBalance(evt.balance);
  }, []);
  const onWalletAddresses = useCallback((evt) => setWalletAddresses(evt), []);
  const onWalletTransactions = useCallback((evt) => setWalletTransactions(evt), []);
  const onWalletVolumes = useCallback((evt) => setWalletVolumes(evt), []);
  const onOverviewBalances = useCallback((evt) => setOverviewBalances(evt), []);
  const onAssetBalances = useCallback((evt) => setAssetBalances(evt), []);
  const onTransactionHistory = useCallback((evt) => setTransactionHistory(evt), []);

  useChannel(client, 'deposit', onDeposit);
  useChannel(client, 'withdraw', onWithdraw);
  useChannel(client, 'stake', onStake);
  useChannel(client, 'logs', onLog);
  useChannel(client, 'wallet', onWallet);
  useChannel(client, 'walletAddresses', onWalletAddresses);
  useChannel(client, 'walletTransactions', onWalletTransactions);
  useChannel(client, 'walletVolumes', onWalletVolumes);
  useChannel(client, 'overviewBalances', onOverviewBalances);
  useChannel(client, 'assetBalances', onAssetBalances);
  useChannel(client, 'transactionHistory', onTransactionHistory);

  const isOpen = status === ConnectionStatus.OPEN;

  return (
    <div className="app">
      <h1>WebSocket Practice — Wallet Simulator</h1>

      <div className={`status status--${status}`}>
        connection: <strong>{status}</strong>
        {balance !== null && <span className="balance">balance: {balance}</span>}
      </div>

      <div className="controls">
        <input
          type="number"
          value={amount}
          min={1}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <button disabled={!isOpen} onClick={() => send('action', { payload: { action: 'deposit', amount } })}>
          Deposit
        </button>
        <button disabled={!isOpen} onClick={() => send('action', { payload: { action: 'withdraw', amount } })}>
          Withdraw
        </button>
        <button disabled={!isOpen} onClick={() => send('action', { payload: { action: 'stake', amount } })}>
          Stake
        </button>
      </div>

      <section>
        <h2>Wallet</h2>
        {wallet ? (
          <div>
            <p>Asset: {wallet.asset}</p>
            <p>Balance: {wallet.balance}</p>
          </div>
        ) : (
          <p>No wallet data received yet.</p>
        )}
      </section>

      <section>
        <h2>Linked Addresses</h2>
        {walletAddresses.length > 0 ? (
          <ul>
            {walletAddresses.map((item) => (
              <li key={item.address}>
                {item.name}: {item.address}
              </li>
            ))}
          </ul>
        ) : (
          <p>No wallet addresses yet.</p>
        )}
      </section>

      <section>
        <h2>Wallet Volumes</h2>
        {walletVolumes.length > 0 ? (
          <ul>
            {walletVolumes.map((item, index) => (
              <li key={`${item.label}-${index}`}>
                {item.label}: {item.value} {item.category ? `(${item.category})` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p>No volume data yet.</p>
        )}
      </section>

      <section>
        <h2>Overview Balances</h2>
        {overviewBalances.length > 0 ? (
          <ul>
            {overviewBalances.map((item) => (
              <li key={item.symbol}>
                {item.name} ({item.symbol}): {item.amount} = {item.value}
              </li>
            ))}
          </ul>
        ) : (
          <p>No overview balances yet.</p>
        )}
      </section>

      <section>
        <h2>Asset Balances</h2>
        {assetBalances.length > 0 ? (
          <ul>
            {assetBalances.map((item) => (
              <li key={item.symbol}>
                {item.name} ({item.symbol}): {item.holding} = {item.value} ({item.change})
              </li>
            ))}
          </ul>
        ) : (
          <p>No asset balances yet.</p>
        )}
      </section>

      <section>
        <h2>Wallet Transactions</h2>
        {walletTransactions.length > 0 ? (
          <ul>
            {walletTransactions.map((tx, index) => (
              <li key={`${tx.symbol}-${index}`}>
                {tx.date}: {tx.type} {tx.amount} {tx.price} — {tx.status}
              </li>
            ))}
          </ul>
        ) : (
          <p>No wallet transactions yet.</p>
        )}
      </section>

      <section>
        <h2>Transaction History</h2>
        {transactionHistory.length > 0 ? (
          <ul>
            {transactionHistory.map((tx) => (
              <li key={tx.txId}>
                {tx.date}: [{tx.txId}] {tx.type} {tx.amount} on {tx.network} — {tx.status}
              </li>
            ))}
          </ul>
        ) : (
          <p>No transaction history yet.</p>
        )}
      </section>

      <h2>Live log</h2>
      <ul className="log">
        {logs.map((l) => (
          <li key={l.id} className={`log-item log-item--${l.level}`}>
            <span className="log-time">{new Date(l.ts).toLocaleTimeString()}</span>
            {l.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
