import { useEffect, useState } from 'react';
import Overzicht from './tabs/Overzicht.jsx';
import Lasten from './tabs/Lasten.jsx';
import Verrekenen from './tabs/Verrekenen.jsx';
import Mensen from './tabs/Mensen.jsx';
import Instellingen from './tabs/Instellingen.jsx';
import Login from './views/Login.jsx';
import Ontgrendel from './views/Ontgrendel.jsx';
import PostForm from './components/PostForm.jsx';
import { Melding, Icoon } from './components/ui.jsx';
import { useSession, signOut } from './lib/auth.js';
import { useKasboek } from './lib/kasboek.js';
import { useSleutelring } from './lib/sleutelring.js';
import { isConfigured } from './lib/config.js';
import { dezeMaand } from './lib/ritme.js';

const TABS = [
  { id: 'overzicht', label: 'Overzicht' },
  { id: 'lasten', label: 'Lasten' },
  { id: 'verrekenen', label: 'Verrekenen' },
  { id: 'mensen', label: 'Mensen' },
  { id: 'meer', label: 'Meer' },
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

  const ring = useSleutelring(user);
  const kasboek = useKasboek(user, ring.sleutel);
  const configured = isConfigured();

  useEffect(() => {
    document.documentElement.dataset.theme = thema;
    localStorage.setItem('pay:thema', thema);
  }, [thema]);

  if (!ready) {
    return (
      <div className="inlog midden">
        <span className="draai" />
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
        onOverslaan={() => {
          localStorage.setItem('pay:lokaal', 'ja');
          setZonderAccount(true);
        }}
      />
    );
  }

  if (ring.staat === 'laden') {
    return (
      <div className="inlog midden">
        <span className="draai" />
      </div>
    );
  }

  if (ring.staat !== 'open') {
    return (
      <Ontgrendel
        ring={ring}
        email={user?.email}
        onUitloggen={session ? () => signOut() : null}
      />
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <h1>Pay</h1>
        <div className="spacer" />
        <span className={`staat ${kasboek.offline ? 'offline' : kasboek.cloud ? 'online' : ''}`}>
          <span className="lamp" />
          {kasboek.offline ? 'geen bereik' : kasboek.cloud ? 'gesynchroniseerd' : 'lokale kluis'}
        </span>
      </div>

      <div className="main">
        {kasboek.fout && <Melding toon="mis">{kasboek.fout}</Melding>}
        {kasboek.laden && !kasboek.posten.length && (
          <div className="midden" style={{ padding: 48 }}><span className="draai" /></div>
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
          <Instellingen user={user} kasboek={kasboek} ring={ring} thema={thema} onThema={setThema} />
        )}
      </div>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <Icoon naam={t.id} maat={21} />
            {t.label}
          </button>
        ))}
      </nav>

      {bewerken && (
        <PostForm
          post={bewerken}
          personen={kasboek.personen}
          rekeningen={kasboek.rekeningen}
          bundels={[...new Set(kasboek.posten.map((p) => p.bundel).filter(Boolean))].sort()}
          onBewaar={(post) => kasboek.bewaar('posten', post)}
          onVerwijder={(id) => kasboek.verwijder('posten', id)}
          onSluit={() => setBewerken(null)}
        />
      )}
    </div>
  );
}
