import { useEffect, useState } from 'react';
import Overzicht from './tabs/Overzicht.jsx';
import Lasten from './tabs/Lasten.jsx';
import Verrekenen from './tabs/Verrekenen.jsx';
import Mensen from './tabs/Mensen.jsx';
import Instellingen from './tabs/Instellingen.jsx';
import Login from './views/Login.jsx';
import PostForm from './components/PostForm.jsx';
import { Note } from './components/ui.jsx';
import { useSession } from './lib/auth.js';
import { useKasboek } from './lib/kasboek.js';
import { isConfigured } from './lib/config.js';
import { dezeMaand } from './lib/ritme.js';

const TABS = [
  { id: 'overzicht', label: 'Overzicht', icon: '🧾' },
  { id: 'lasten', label: 'Lasten', icon: '🔁' },
  { id: 'verrekenen', label: 'Verrekenen', icon: '🤝' },
  { id: 'mensen', label: 'Mensen', icon: '👥' },
  { id: 'meer', label: 'Meer', icon: '⚙️' },
];

/** Hash-routing: op GitHub Pages is er geen server die paden kan afhandelen. */
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const opWissel = () => setHash(window.location.hash);
    window.addEventListener('hashchange', opWissel);
    return () => window.removeEventListener('hashchange', opWissel);
  }, []);
  return { joinCode: hash.match(/^#\/join\/(.+)$/)?.[1] || null };
}

export default function App() {
  const { ready, session, user } = useSession();
  const { joinCode } = useHashRoute();
  const [tab, setTab] = useState('overzicht');
  const [maand, setMaand] = useState(dezeMaand);
  const [bewerken, setBewerken] = useState(null);
  const [thema, setThema] = useState(() => localStorage.getItem('pay:thema') || 'light');
  const [zonderAccount, setZonderAccount] = useState(
    () => localStorage.getItem('pay:lokaal') === 'ja'
  );

  const kasboek = useKasboek(user);
  const configured = isConfigured();

  useEffect(() => {
    document.documentElement.dataset.theme = thema;
    localStorage.setItem('pay:thema', thema);
  }, [thema]);

  if (!ready) {
    return (
      <div className="login-wrap center">
        <span className="spinner" />
      </div>
    );
  }

  // Een uitnodigingslink gaat voor op "ik klikte laatst weg naar de lokale
  // kluis": anders krijgt de uitgenodigde het aanmeldscherm nooit te zien.
  if (!session && (!zonderAccount || joinCode)) {
    return (
      <Login
        configured={configured}
        joinCode={joinCode}
        onSkip={() => {
          localStorage.setItem('pay:lokaal', 'ja');
          setZonderAccount(true);
        }}
      />
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <h1><span>🧾</span> Pay</h1>
        <div className="spacer" />
        <span className={`sync ${kasboek.offline ? 'offline' : kasboek.cloud ? 'online' : 'local'}`}>
          <span className="led" />
          {kasboek.offline ? 'geen bereik' : kasboek.cloud ? 'gesynchroniseerd' : 'lokale kluis'}
        </span>
      </div>

      <div className="main">
        {kasboek.fout && <Note tone="bad">{kasboek.fout}</Note>}
        {kasboek.laden && !kasboek.posten.length && (
          <div className="center" style={{ padding: 40 }}><span className="spinner" /></div>
        )}

        {tab === 'overzicht' && <Overzicht kasboek={kasboek} maand={maand} onMaand={setMaand} />}

        {tab === 'lasten' && (
          <Lasten
            kasboek={kasboek}
            maand={maand}
            onOpen={setBewerken}
            onNieuw={() => setBewerken({})}
            onBewaar={(post) => kasboek.bewaar('posten', post)}
          />
        )}

        {tab === 'verrekenen' && <Verrekenen kasboek={kasboek} maand={maand} />}

        {tab === 'mensen' && <Mensen kasboek={kasboek} />}

        {tab === 'meer' && (
          <Instellingen user={user} kasboek={kasboek} thema={thema} onThema={setThema} />
        )}
      </div>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span className="ico">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {bewerken && (
        <PostForm
          post={bewerken}
          personen={kasboek.personen}
          rekeningen={kasboek.rekeningen}
          onBewaar={(post) => kasboek.bewaar('posten', post)}
          onVerwijder={(id) => kasboek.verwijder('posten', id)}
          onClose={() => setBewerken(null)}
        />
      )}
    </div>
  );
}
