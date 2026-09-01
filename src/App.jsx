import { useEffect, useState } from 'react';
import Overview from './tabs/Overview.jsx';
import Expenses from './tabs/Expenses.jsx';
import Settle from './tabs/Settle.jsx';
import People from './tabs/People.jsx';
import Settings from './tabs/Settings.jsx';
import Login from './views/Login.jsx';
import Unlock from './views/Unlock.jsx';
import ExpenseForm from './components/ExpenseForm.jsx';
import { Notice, Icon } from './components/ui.jsx';
import { useSession, signOut } from './lib/auth.js';
import { useStore } from './lib/store.js';
import { useKeyring } from './lib/keyring.js';
import { isConfigured } from './lib/config.js';
import { thisMonth } from './lib/cadence.js';

const TABS = [
  { id: 'overview', label: 'Overzicht' },
  { id: 'expenses', label: 'Lasten' },
  { id: 'settle', label: 'Verrekenen' },
  { id: 'people', label: 'Mensen' },
  { id: 'more', label: 'Meer' },
];

/** Hash routing: on GitHub Pages there is no server to handle paths. */
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return { joinCode: hash.match(/^#\/join\/(.+)$/)?.[1] || null };
}

export default function App() {
  const { ready, session, user } = useSession();
  const { joinCode } = useHashRoute();
  const [tab, setTab] = useState('overview');
  const [month, setMonth] = useState(thisMonth);
  const [editing, setEditing] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('pay:theme') || 'light');
  const [withoutAccount, setWithoutAccount] = useState(
    () => localStorage.getItem('pay:local') === 'yes'
  );

  const keyring = useKeyring(user);
  const store = useStore(user, keyring.key);
  const configured = isConfigured();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('pay:theme', theme);
  }, [theme]);

  if (!ready) {
    return (
      <div className="auth center">
        <span className="spinner" />
      </div>
    );
  }

  // An invite link beats "I once clicked away to local mode": otherwise the
  // invitee would never see the sign-up screen.
  if (!session && (!withoutAccount || joinCode)) {
    return (
      <Login
        configured={configured}
        joinCode={joinCode}
        onSkip={() => {
          localStorage.setItem('pay:local', 'yes');
          setWithoutAccount(true);
        }}
      />
    );
  }

  if (keyring.state === 'loading') {
    return (
      <div className="auth center">
        <span className="spinner" />
      </div>
    );
  }

  if (keyring.state !== 'open') {
    return (
      <Unlock keyring={keyring} email={user?.email} onSignOut={session ? () => signOut() : null} />
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <h1>Pay</h1>
        <div className="spacer" />
        <span className={`status ${store.offline ? 'offline' : store.cloud ? 'online' : ''}`}>
          <span className="lamp" />
          {store.offline ? 'geen bereik' : store.cloud ? 'gesynchroniseerd' : 'lokale kluis'}
        </span>
      </div>

      <div className="main">
        {store.error && <Notice tone="error">{store.error}</Notice>}
        {store.loading && !store.expenses.length && (
          <div className="center" style={{ padding: 48 }}><span className="spinner" /></div>
        )}

        {tab === 'overview' && <Overview store={store} month={month} onMonth={setMonth} />}

        {tab === 'expenses' && (
          <Expenses
            store={store}
            month={month}
            onOpen={setEditing}
            onNew={() => setEditing({})}
            onSave={(expense) => store.save('expenses', expense)}
          />
        )}

        {tab === 'settle' && <Settle store={store} month={month} />}

        {tab === 'people' && <People store={store} />}

        {tab === 'more' && (
          <Settings user={user} store={store} keyring={keyring} theme={theme} onTheme={setTheme} />
        )}
      </div>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <Icon name={t.id} size={21} />
            {t.label}
          </button>
        ))}
      </nav>

      {editing && (
        <ExpenseForm
          expense={editing}
          people={store.people}
          accounts={store.accounts}
          charges={[...new Set(store.expenses.map((e) => e.charge).filter(Boolean))].sort()}
          onSave={(expense) => store.save('expenses', expense)}
          onRemove={(id) => store.remove('expenses', id)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
