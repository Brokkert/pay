# Supabase instellen (eenmalig, gratis)

Pay werkt meteen zonder dit alles — dan draait hij als **lokale kluis**: alles
staat in je browser en je vriendin kan niet meekijken. Wil je samen bijhouden en
tussen je telefoon en laptop synchroniseren, dan heb je een eigen (gratis)
Supabase-project nodig. Reken op een minuut of tien.

---

## 1. Project aanmaken

Maak op [supabase.com](https://supabase.com/dashboard) een nieuw project aan. Het
gratis plan is ruim: 500 MB database. Ter vergelijking: een post is ongeveer een
halve kilobyte, dus je zit pas bij honderdduizenden posten aan die grens.

## 2. Het schema draaien

Ga naar **SQL Editor**, plak de volledige inhoud van
[`supabase/schema.sql`](supabase/schema.sql) en druk op **Run**.

Dat zet in één keer neer:

- de tabellen (huishoudens, leden, sleutels, personen, rekeningen, posten,
  uitnodigingen);
- Row Level Security, zodat een ander huishouden niets van het jouwe ziet;
- de trigger die nieuwe gebruikers alleen met een geldige uitnodiging binnenlaat.

Het bestand is idempotent: na een update van Pay kun je het gewoon opnieuw
draaien zonder je gegevens kwijt te raken.

> **Kom je van een eerdere versie?** Toen stonden namen en bedragen nog in
> gewone kolommen. Dit schema gooit die kolommen weg — versleutelen kan alleen in
> de browser, en de database heeft de sleutel niet, dus meeverhuizen kan niet.
> Exporteer eerst je gegevens via **Meer → Volledige reservekopie**, draai daarna
> het schema, en plak ze terug. Sta je nog aan het begin, dan is er niets aan de
> hand.

## 3. Inloggen per e-mail aanzetten

Onder **Authentication → Sign In / Providers**:

- **Email** aan.
- **Confirm email** aan (dat ís de magic link).
- Wachtwoorden mag je uitzetten; Pay gebruikt ze niet. Dat scheelt meteen een
  wachtwoord dat je met je vriendin zou moeten delen, want dat is precies wat je
  niet wilt.

### Over de code van zes cijfers

Pay heeft een veldje om een code van zes cijfers in te tikken, voor als je de mail
op je telefoon opent terwijl de app op je laptop staat. **Met de ingebouwde
mailserver van Supabase krijg je die code niet.** De standaardtemplate bevat
alleen een *Sign in*-link, en templates zijn niet te bewerken zolang je geen eigen
SMTP hebt ingesteld — het dashboard zegt dat er ook bij:

> Set up custom SMTP to edit templates. Emails will be sent using the default
> templates.

Dat is geen probleem: die link werkt prima, en het codeveld staat ingeklapt als
terugvaloptie. Wil je de code er tóch bij, dan heb je eigen SMTP nodig; zet daarna
in **Authentication → Emails → Magic Link** iets als:

```html
<p><a href="{{ .ConfirmationURL }}">Klik hier om in te loggen</a></p>
<p>Of tik deze code over: <strong>{{ .Token }}</strong></p>
```

### Waar de link naartoe mag terugkeren

Onder **Authentication → URL Configuration**:

- **Site URL**: `https://<jouw-github-naam>.github.io/pay/`
- **Redirect URLs**: dezelfde, plus `http://localhost:5173/` om lokaal te kunnen
  ontwikkelen.

> **Let op — dit is de enige plek waar gratis echt knelt.** De ingebouwde
> mailserver van Supabase is bedoeld om te testen en is stevig aan banden gelegd.
> Het getal dat voor jouw project geldt staat in het dashboard onder
> **Authentication → Rate Limits**, bij *Rate limit for sending emails*. Kijk daar
> in plaats van af te gaan op wat iemand je vertelt.
>
> Voor twee mensen is dat ruim voldoende — je sessie blijft staan, je logt zelden
> in. Zou je met een handvol mensen tegelijk aanmelden, dan loop je ertegenaan.
> Oplossing: vul onder **Project Settings → Authentication → SMTP Settings** een
> eigen mailserver in. Gratis opties zijn [Brevo](https://www.brevo.com) (300
> mails per dag) en [Resend](https://resend.com). Aan Pay hoeft er niets te
> veranderen.

## 4. De sleutels in de app zetten

Onder **Project Settings → API** vind je de **Project URL** en de **publishable
key** (die begint met `sb_publishable_`). Zet ze in
[`src/lib/config.js`](src/lib/config.js):

```js
export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_xxxxxxxxxxxxxxxx';
```

Deze sleutel hóórt in je broncode te staan en is bedoeld om openbaar te zijn. Hij
geeft in zijn eentje nergens toegang toe: dat regelt Row Level Security in de
database. Gebruik nooit de `service_role`-sleutel in de app — die omzeilt alle
beveiliging.

> Even proberen zonder te herbouwen? Je kunt dezelfde twee waarden ook in de app
> zelf invullen, bij **Meer → Verbinding instellen**. Ze blijven dan in je eigen
> browser. Voor je vriendin moeten ze wél in `config.js` staan, want zij heeft
> jouw browser niet.

## 5. Aanmelden gaat alleen via een uitnodiging

Je publishable key komt in een openbare repo en in de JavaScript die elke
bezoeker binnenhaalt. Zonder maatregel kan iedereen die hem oppikt een account
maken in jouw project. Pay lost dat in twee lagen op.

**Laag 1 — de voorpagina biedt geen aanmelden aan.** Wie op de site belandt ziet
alleen een inlogveld voor bestaande gebruikers. Dit houdt bots tegen die het web
afstruinen, meer niet: het is verstoppen, geen slot.

**Laag 2 — de database eist een geldige code.** Dit is het slot. De trigger op
`auth.users` weigert elke nieuwe gebruiker zonder geldige uitnodigingscode, ook
als iemand het formulier overslaat en de auth-endpoint rechtstreeks aanroept.
Codes kunnen aflopen, een maximum aantal keer bruikbaar zijn en ingetrokken
worden — en er staat alleen een SHA-256-hash van in de database.

> **Meld jezelf als eerste aan.** De allereerste gebruiker mag zonder uitnodiging
> binnen en krijgt meteen een vers huishouden; anders kun je nooit beginnen.
> Zolang er nog niemand is, biedt het inlogscherm dat uit zichzelf aan. Zodra jij
> binnen bent verdwijnt die deur en heeft iedereen een uitnodiging nodig, jij
> incluis.
>
> Direct daarna kies je een **wachtwoordzin**. Daarmee wordt alles versleuteld
> voordat het je apparaat verlaat. Schrijf hem ergens veilig op: hij staat
> nergens, dus hij is ook niet te herstellen.

Je vriendin uitnodigen doe je daarna in de app: **Meer → Iemand toegang geven**.
Je krijgt een link die je doorstuurt; hij is één keer bruikbaar en veertien dagen
geldig.

> **Na het aanmelden moet je haar nog binnenlaten.** Zij kiest eerst haar eigen
> wachtwoordzin; jij ziet daarna bij **Meer** dat er iemand wacht en klikt op
> *Binnenlaten*. Pas dan kan zij bij de gegevens. Dat is één klik extra, en het
> scheelt dat er ooit een sleutel door een chat-app gaat.
>
> Daarna koppelt ze zichzelf aan de juiste persoon via **Mensen → (persoon) →
> Dit ben ik**. Namen zijn versleuteld, dus dat kan de database niet voor je
> raden.

## 6. De keepalive aanzetten

Supabase pauzeert gratis projecten als er te weinig gebeurt. In
[`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml) staat een
workflow die er dagelijks even tegenaan tikt. Vul bovenin dezelfde twee waarden
in:

```yaml
env:
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co'
  SUPABASE_KEY: 'sb_publishable_xxxxxxxxxxxxxxxx'
```

Zolang die leeg zijn, slaat de workflow zichzelf netjes over.

> GitHub zet geplande workflows uit na 60 dagen zonder activiteit in de repo. Als
> je Pay een tijd niet gebruikt én er niets pusht, kan het project alsnog
> pauzeren. Weer wakker maken kost één klik in het Supabase-dashboard.

---

## Controleren of het klopt

Het beveiligingsmodel is te testen zonder je echte project aan te raken. Met een
lokale PostgreSQL:

```bash
./supabase/run-tests.sh
```

Dat zet een wegwerpdatabase op, draait `schema.sql` erover en controleert onder
meer dat er geen enkele leesbare kolom bestaat, dat een tweede huishouden je
gegevens niet ziet, dat een ingetrokken, verlopen of opgebruikte uitnodiging echt
dichtgaat, dat je sleutelpakketjes privé blijven, en dat je jezelf wel aan een
persoon kunt koppelen en iemand anders niet. Fouten laten het script met een
foutcode stoppen; dezelfde controle draait bij elke push in GitHub Actions.

## Wat er bewust niet in zit

Iedereen in een huishouden mag alle posten lezen én wijzigen. Dat is opzet: het
gaat over geld dat jullie samen uitgeven, en een half overzicht is geen
overzicht. Er is dus geen rollenmodel waarin één van jullie alleen mag kijken.

Er is ook geen "wachtwoordzin vergeten". Die zou betekenen dat iemand anders je
sleutel kan herstellen, en dan is de versleuteling een sierstuk. Schrijf hem op.
