import type { GuideText } from "./types";

// Afrikaans translation of en.ts. Keep the tags and class names exactly as there.
export const af: GuideText = {
  title: "Portaalgids",
  standfirst:
    "Hoe om die portaal te gebruik: waar die beleide is, hoe ’n beleid teen die wet getoets word, hoe geld aangevra en goedgekeur word, hoe ’n vergadering se notule geskryf, nagegaan, onderteken en in aksies omgesit word, en hoe lokale bespreek word. Geskryf vir beheerliggaamlede, nie vir rekenaarmense nie.",
  chapter: "Hoofstuk",
  contents: "Inhoud",
  edition: "Uitgawe",
  standard: "Standaard",
  covers: (n) => `Dek ${n} hoofstukke`,
  chapters: (school, body) => [
    {
      title: "Om in te kom",
      html: `
<p class="lede">Elkeen wat die portaal gebruik, het ’n eie aanmelding. Daar is geen gedeelde wagwoord nie.</p>
<ol class="steps">
  <li>Gaan na jou skool se portaaladres en meld aan met jou e-posadres.</li>
  <li>Eerste keer hier, of het jy dit vergeet? Gebruik <span class="ui">Wagwoord vergeet?</span> op die aanmeldbladsy. ’n Skakel kom per e-pos en werk vir omtrent ’n uur.</li>
  <li>Die skakel werk een keer. Sodra jy ’n wagwoord stel, werk dit nie meer nie, so vra eerder vir ’n nuwe een as om ’n ou e-pos weer te gebruik.</li>
</ol>
<div class="note">
  <span class="lbl">Niks ontvang nie?</span>
  <p>Kyk eers in die gemorsvouer. Skool-e-posstelsels is versigtig met e-pos van ’n adres wat hulle nog nie gesien het nie. As dit nie daar is nie, vra ’n administrateur om die adres wat vir jou gestoor is na te gaan onder <span class="ui">Admin</span>, <span class="ui">Gebruikers</span>: ’n skakel wat na ’n adres gestuur is wat niemand lees nie, lyk presies soos ’n skakel wat nooit gestuur is nie.</p>
</div>`,
    },
    {
      title: "Om jou pad te vind",
      html: `
<p class="lede">Die kantbalk is die hele portaal. Wat jy kan sien, hang af van wat jy mag doen.</p>
<ul>
  <li><strong>Paneelbord</strong> is die opsomming: uitstaande aksies, besteding wat op goedkeuring wag, onlangse nakomingstoetse.</li>
  <li><strong>Mense</strong> is die ${body}-register: wie nou watter posisie beklee.</li>
  <li><strong>Aksiepunte</strong> wys wie ingestem het om wat te doen, en teen wanneer.</li>
  <li><strong>Vergadernotules</strong> is waar notules geskryf, nagegaan en onderteken word.</li>
  <li><strong>Gids</strong> is hierdie dokument.</li>
  <li><strong>Beleide</strong>, <strong>Nakoming</strong> en <strong>Dokumente</strong> hou die bestuursdokumente en die toetse wat daarteen gedoen is.</li>
  <li><strong>Besteding</strong> is aansoeke om fondse, kwotasies, goedkeurings en die begrotingsverslae.</li>
  <li><strong>Lokale</strong> is die kalender vir vergaderlokale.</li>
  <li><strong>Admin</strong> is alles wat een keer opgestel word: gebruikers, rolle, etikette, handelsmerk, e-posse en instellings.</li>
</ul>
<p>As ’n bladsy wat jy verwag ontbreek, is dit ’n toestemming en nie ’n fout nie. ’n Administrateur kan dit gee onder <span class="ui">Admin</span>, <span class="ui">Rolle</span>.</p>`,
    },
    {
      title: "Lees die portaal in jou taal",
      html: `
<p class="lede">Die portaal praat sewe tale: Engels, Afrikaans, isiZulu, isiXhosa, Sepedi, Setswana en Sesotho.</p>
<p>Kies jou taal in die blokkie regs bo op enige bladsy, selfs die aanmeldbladsy. Elke knoppie, etiket, boodskap en hierdie gids verander dadelik, en die portaal onthou jou keuse op daardie toestel. Dit kos niks.</p>
<h3>Jou skool se eie dokumente</h3>
<p>’n Beleid of ’n notule is deur jou skool geskryf, so geen woordeboek ken dit vooraf nie. Dié word op versoek vertaal en met vertaalkrediete betaal.</p>
<ul>
  <li>Krediete kos R100 vir 10 en verval nooit. Bestel dit onder <span class="ui">Admin</span>, <span class="ui">Vertaalkrediete</span>.</li>
  <li>Een krediet vertaal tot 10 bladsye van een dokument in een taal.</li>
  <li>Sodra ’n dokument vertaal is, lees almal by jou skool dit gratis in daardie taal.</li>
</ul>
<div class="note">
  <span class="lbl">Wie mag krediete gebruik</span>
  <p>Niemand kan krediete gebruik voordat ’n administrateur <span class="ui">Mag vertaalkrediete gebruik</span> vir daardie persoon merk onder <span class="ui">Admin</span>, <span class="ui">Gebruikers</span>.</p>
</div>`,
    },
    {
      title: "Ons mense",
      html: `
<p class="lede">Wie nou op jou ${body} dien, en in watter posisie.</p>
<p><span class="ui">Mense</span> wys almal op die register as ’n kaart met hul posisie en e-posadres, en jy kan op naam of posisie soek. Dit beantwoord die vraag "wie is ons tesourier vanjaar?"</p>
<ol class="steps">
  <li>Hou dit op datum onder <span class="ui">Admin</span>, <span class="ui">Mense en posisies</span>. Werk dit by op die dag wat iemand aansluit of vertrek.</li>
  <li>Die lys posisies, en die volgorde waarin die bladsy lees, word gestel onder <span class="ui">Admin</span>, <span class="ui">Persoontipes</span>.</li>
</ol>
<div class="note">
  <span class="lbl">’n Persoon het nie ’n aanmelding nodig nie</span>
  <p>Iemand op die register kan notules en herinneringe per e-pos ontvang sonder om ooit aan te meld. Gee hulle net ’n aanmelding as hulle die portaal moet gebruik.</p>
</div>`,
    },
    {
      title: "Beleide",
      html: `
<p class="lede">Elke bestuursbeleid op een plek, met sy volle geskiedenis.</p>
<p>Laai ’n beleid op en die portaal hou dit met ’n weergawegeskiedenis, so die afskrif wat die ${body} in Maart goedgekeur het, is steeds daar nadat dit in September hersien is. Niks word oorskryf nie en niks gaan verlore nie.</p>
<ol class="steps">
  <li><span class="ui">Beleide</span>, dan <span class="ui">Laai beleid op</span>.</li>
  <li>Gee dit ’n naam waarna ’n mens sou soek, nie ’n lêernaam nie, en kies ’n kategorie.</li>
  <li>As jy ’n bestaande beleid vervang, word ’n weergawe bygevoeg eerder as ’n tweede beleid.</li>
</ol>
<p>Die kategorieë (Finansies, Bestuur, Veiligheid ensovoorts) kan jy self verander onder <span class="ui">Admin</span>, <span class="ui">Beleidskategorieë</span>.</p>`,
    },
    {
      title: "Om ’n nakomingstoets te doen",
      html: `
<p class="lede">Laai ’n dokument op en kry ’n nakomingstelling teen Suid-Afrikaanse onderwyswetgewing, met die leemtes een vir een gelys.</p>
<p>Toetse word gedoen teen die <strong>BELA Act</strong>, <strong>SASA</strong> en provinsiale regulasies. Jy kry ’n telling, en daaronder die spesifieke leemtes wat gevind is: ’n delegering wat nie aangeteken is nie, ’n ontbrekende jaarlikse besluit, ’n gedragskode wat verouderd is.</p>
<ul>
  <li>Toets ’n beleid direk vanaf sy bladsy met <span class="ui">Voer nakomingstoets uit</span>, of laai enige lêer op onder <span class="ui">Nakoming</span>, <span class="ui">Voer toets uit</span>.</li>
  <li>Dokumente wat nie beleide is nie, soos ’n kontrak of ’n plan, gaan onder <span class="ui">Dokumente</span> en word op dieselfde manier getoets.</li>
</ul>
<h3>Jou eie riglyne</h3>
<p>Onder <span class="ui">Nakoming</span>, <span class="ui">Riglyne</span> kan jy die reëls oplaai waarteen ’n toets ook moet meet: ’n provinsiale omsendbrief, of vir ’n onafhanklike skool, jou eie raad se reëls. Elke toets daarna neem dit in ag.</p>
<div class="careful">
  <span class="lbl">Wat ’n toets is en wat dit nie is nie</span>
  <p>Dit bring leemtes teenoor die wetgewing na vore. Dit maak nie die skool nakomend nie, en dit is nie regsadvies nie. Die waarde is dat iemand dit op ’n Dinsdagmiddag kan doen, eerder as om dieselfde leemtes tydens ’n oudit te ontdek.</p>
</div>
<p>Elke toets word gestoor, so die telling kan vergelyk word nadat ’n beleid hersien is.</p>`,
    },
    {
      title: "Om fondse aan te vra",
      html: `
<p class="lede">Hoe ’n projek die ${body} vir geld vra.</p>
<p>Elke versoek gaan deur dieselfde vorm, maak nie saak hoe groot die bedrag is nie. Klein bedrae word aangeteken eerder as vir goedkeuring gestuur, maar hulle gaan deur dieselfde deur, so die skool kry een volledige rekord van wat bestee is en hoekom.</p>
<ul>
  <li><strong>Die projek en waarvoor dit is.</strong> Skryf dit vir iemand wat nie in die vergadering was nie.</li>
  <li><strong>Die beraamde bedrag.</strong> Dit bepaal in watter goedkeuringsband dit val.</li>
  <li><strong>Waar die geld vandaan kom.</strong> Een versoek kan oor verskeie bronne verdeel word.</li>
  <li><strong>Kwotasies.</strong> Heg dit aan en teken aan watter verskaffer gekies is.</li>
</ul>`,
    },
    {
      title: "Om besteding goed te keur",
      html: `
<p class="lede">Wie ’n versoek moet goedkeur, word deur die bedrag bepaal, en dit word een keer opgestel.</p>
<p>Onder <span class="ui">Admin</span>, <span class="ui">Goedkeuringsinstellings</span> word bedragbande aan groepe mense gekoppel. Onder een bedrag word ’n versoek net aangeteken; bo ’n ander gaan dit na die finansiële komitee. Stel die bande een keer op en elke aansoek daarna vind self sy weg.</p>
<div class="careful">
  <span class="lbl">Goedkeurders word VASGESTEL wanneer ’n versoek ingedien word</span>
  <p>Wie ook al op die oomblik van indiening vereis was, bly vereis. ’n Komitee wat volgende week ’n lid bykry, maak nie ’n aansoek wat reeds besluit is weer oop nie.</p>
</div>
<p>Goedkeurders is genoemde mense wat op ’n <strong>etiket</strong> gedra word, nie ’n postitel nie, want goedkeuringsgesag behoort aan ’n persoon en nie aan ’n rol nie.</p>`,
    },
    {
      title: "Die begroting en bestedingsverslae",
      html: `
<p class="lede">Hoeveel die ${body} opsy gesit het, hoeveel belowe is, en hoeveel bestee is.</p>
<p>Onder <span class="ui">Admin</span>, <span class="ui">Bestedingsinstellings</span> stel jy die begrotingsjaar, die totale CAPEX-begroting en die maand waarin jou finansiële jaar eindig. Die bronne van fondse (CAPEX, fondsinsameling ensovoorts) word ook daar gelys, en jy kan jou eie byvoeg.</p>
<p><span class="ui">Besteding</span>, <span class="ui">Verslae</span> wys dan:</p>
<ul>
  <li><strong>Begroting teenoor besteding:</strong> die begroting, wat verbind is (goedgekeur) en wat werklik bestee is (voltooi).</li>
  <li><strong>Elke bron van fondse:</strong> aangevra, verbind en bestee.</li>
  <li><strong>Elke projek:</strong> wie gevra het, hoeveel, die kwotasies, die verskaffer en hoe ver dit gevorder het.</li>
</ul>
<p><span class="ui">Voer uit na Excel</span> gee die tesourier dieselfde syfers as ’n sigblad.</p>`,
    },
    {
      title: "Om die notule te skryf",
      html: `
<p class="lede">Waar ’n vergadering se rekord geskryf word, en wat dit die skool se eie dokument maak.</p>
<p>Maak <span class="ui">Vergadernotules</span> oop en kies <span class="ui">Voeg notule by</span>. Daar is twee maniere om te begin, en albei eindig op dieselfde plek.</p>
<h3>Begin met ’n sjabloon</h3>
<p>’n Sjabloon is die vorm van ’n vergadering: die afdelings wat jou ${body} altyd dek, in volgorde, met die vaste bewoording reeds ingevul. Die bywoningslys verander amper nooit, so dit bly op die sjabloon en word gewysig eerder as oorgetik. Sjablone word gebou onder <span class="ui">Admin</span>, <span class="ui">Notule-admin</span>.</p>
<ol class="steps">
  <li>Kies <span class="ui">Skryf dit hier</span> en kies ’n sjabloon.</li>
  <li>Gee die notule ’n naam, kies die vergadering en stel die tydperk. ’n Tydperk kan ’n maand, ’n kwartaal of datums wat jy kies wees.</li>
  <li>Tik in elke afdeling. Elke afdeling het ’n opskrif, wat bespreek is, en wie verantwoordelik is.</li>
</ol>
<div class="note">
  <span class="lbl">Hoekom nommering laer af begin</span>
  <p>Bywoning en verskonings is nie ’n genommerde punt nie, so nommering begin gewoonlik by die tweede of derde afdeling. Wie die sjabloon opstel, besluit watter afdeling nommer 1 is.</p>
</div>
<h3>Laai ’n notule op wat jy reeds het</h3>
<p>As die sekretaris in Word skryf, kies <span class="ui">Laai ’n lêer op</span>. Die lêer word gehou soos dit is, en die notule kan steeds nagegaan en onderteken word.</p>
<h3>Die Word-dokument</h3>
<p><span class="ui">Laai af as Word</span> maak die dokument om te druk of rond te stuur. Jou skool se wapen staan bo-aan, en die notule volg in ’n genommerde tabel wat op die bladsy pas.</p>`,
    },
    {
      title: "Stuur ’n konsep uit om na te gaan",
      html: `
<p class="lede">Voordat iemand teken, gaan die konsep na die mense wat dit nagaan.</p>
<p>Druk <span class="ui">Stuur konsep 1 vir nagaan</span>. Almal op die skool se konseplys kry ’n skakel per e-pos, maak die notule oop, en keur dit goed of stuur dit terug.</p>
<ul>
  <li><strong>Keur goed</strong> sê die konsep is ’n regverdige rekord van die vergadering.</li>
  <li><strong>Stuur terug</strong> vra vir veranderinge en <strong>vereis ’n nota</strong>. Daarsonder hoor die sekretaris net dat iemand ontevrede is.</li>
</ul>
<p>As een persoon dit terugstuur, gaan die hele konsep dadelik terug. Dit help nie om die res van die goedkeurings in te samel vir ’n dokument wat reeds herskryf word nie.</p>
<div class="careful">
  <span class="lbl">’n Goedkeuring behoort aan die konsep wat dit beantwoord het</span>
  <p>’n Herskrewe notule is ’n nuwe konsep en het sy eie goedkeurings nodig. Die vorige goedkeurings bly as geskiedenis op die rekord, maar tel nie. Niemand moet by die ondertekening aankom met goedkeurings vir ’n weergawe wat niemand gelees het nie.</p>
</div>
<div class="note">
  <span class="lbl">Jy hoef nie ’n administrateur te wees om ’n konsep na te gaan nie</span>
  <p>Wat dit bepaal, is of jy op die lys is waarheen die konsep gestuur is, niks anders nie.</p>
</div>`,
    },
    {
      title: "Om die notule te onderteken",
      html: `
<p class="lede">Ondertekening gebeur op die dokument self, soos op Adobe of SignNow.</p>
<p>Elkeen wat teken, kry <strong>hul eie kode van ses karakters</strong> per e-pos. Die skakel maak die hele dokument oop, en die ondertekening is daaronder, so jy blaai verby dit waarmee jy instem op pad soontoe.</p>
<ol class="steps">
  <li>Maak die skakel oop en lees die notule.</li>
  <li>Teken: <strong>teken</strong> met ’n vinger of ’n muis, of <strong>tik</strong> jou naam in ’n handtekeningskrif. Albei verskyn in die Word-lêer.</li>
  <li>Tik die kode uit jou e-pos in en bevestig.</li>
</ol>
<div class="careful">
  <span class="lbl">Die kode is die hele punt</span>
  <p>Dit het na jou adres gegaan en na niemand anders s’n nie, dit word nooit gestoor op ’n manier wat iemand kan teruglees nie, en dit word een keer gebruik. Moenie dit aan iemand stuur om namens jou te teken nie: die rekord sal sê jy het geteken.</p>
</div>
<h3>Die dokumentverwysing</h3>
<p>Elke handtekening teken ’n vingerafdruk aan van die presiese bewoording wat onderteken is, wat op die notule as ’n kort verwysing gewys word. ’n Afskrif wat volgende jaar gemaak word, kan daarteen nagegaan word. As ’n handtekening ooit nie meer pas nie, sê die portaal dit duidelik eerder as om stilletjies te herbereken, want dit is bewys dat die rekord na ondertekening verander het.</p>
<h3>Teken op papier</h3>
<p>Laai die Word-lêer af, teken met die hand, en laai die skandering op met <span class="ui">Laai ’n ondertekende afskrif op</span>. Dit sluit die notule op dieselfde manier af en teken dieselfde vingerafdruk aan.</p>
<h3>Stuur die ondertekende notule uit</h3>
<p>Wanneer die laaste handtekening inkom, gaan die ondertekende notule outomaties na almal op die verspreidingslys. Daar is ook ’n <span class="ui">Stuur aan die beheerliggaam</span>-knoppie, wat presies sê wie dit sal bereik voordat jy dit druk.</p>
<div class="note">
  <span class="lbl">Gebruik die knoppie as jy op papier geteken het</span>
  <p>’n Notule wat afgesluit is deur ’n skandering op te laai, gaan nooit deur die elektroniese ondertekeningstap nie, so niks stuur dit outomaties nie. Die knoppie is hoe dit die ${body} bereik, en hoe om weer te stuur as ’n adres teruggebons het.</p>
</div>
<div class="careful">
  <span class="lbl">’n Ondertekende notule kan nie gewysig word nie</span>
  <p>Sodra elke handtekening in is, is die rekord gesluit. Korrigeer enigiets in die volgende notule. Dit is wat ’n handtekening die moeite werd maak.</p>
</div>`,
    },
    {
      title: "Aksiepunte",
      html: `
<p class="lede">Die register van wie ingestem het om wat te doen, en teen wanneer.</p>
<p><span class="ui">Aksiepunte</span> is een rooster van alles wat uitstaan, met ’n eienaar, ’n datum en hoe ver dit gevorder het. Enigiemand wat aanmeld, kan dit sien, want iemand wat nie hul eie aksie kan sien nie, kan nie daarop reageer nie.</p>
<h3>Opper een uit die notule</h3>
<p>Dit is die regte manier. Maak die notule oop en gebruik <span class="ui">Opper ’n aksie</span>, of kies die punt waaruit dit gekom het. Die opskrif en die bewoording in die notule word oorgedra, so jy wysig eerder as om oor te tik wat die vergadering besluit het.</p>
<p>Die aksie wys dan watter vergadering dit besluit het en skakel terug daarheen. Die notule lys elke aksie wat daaruit gekom het. Die twee lyste kan nie van mekaar af wegdryf nie.</p>
<div class="note">
  <span class="lbl">’n Ondertekende notule is die beste plek om aksies uit te opper</span>
  <p>Om een te opper, verander niks aan die notule nie, en ’n ondertekende rekord is die mees gesaghebbende verklaring van wat besluit is.</p>
</div>
<h3>Om hulle op te volg</h3>
<p>Die portaal stuur ’n herinnering per e-pos ’n vasgestelde aantal dae voor die sperdatum en kan dit herhaal totdat die aksie gesluit is. Jy kies wie opgevolg word. Niemand hoef te onthou om te por nie.</p>
<p>Die kategorieë waaronder ’n aksie geliasseer kan word, word gestel onder <span class="ui">Admin</span>, <span class="ui">Aksiekategorieë</span>.</p>`,
    },
    {
      title: "Bespreek ’n vergaderlokaal",
      html: `
<p class="lede">Die raadsaal en die saal op een gedeelde kalender, sodat twee vergaderings nooit in dieselfde lokaal beland nie.</p>
<ol class="steps">
  <li>’n Administrateur voeg die lokale een keer by onder <span class="ui">Lokale</span>, <span class="ui">Vergaderlokale</span>.</li>
  <li>Maak <span class="ui">Lokale</span>, <span class="ui">Besprekings</span> oop, kies ’n lokaal, en klik op ’n oop tydgleuf op die weekkalender.</li>
  <li>Gee die vergadering ’n naam en ’n tyd. Jy kan namens iemand anders bespreek.</li>
</ol>
<ul>
  <li><strong>Botsings word betyds gevang</strong>: ’n tydgleuf wat reeds geneem is, kan nie twee keer bespreek word nie.</li>
  <li><strong>Herhaal ’n bespreking</strong> daagliks, weekliks of maandeliks, tot 52 keer. Verander een vergadering in die reeks, of kanselleer hierdie een en elkeen daarna. Vorige vergaderings word gehou.</li>
  <li><strong>Herinneringe</strong> gaan per e-pos om 07:00 op die dag van die vergadering. ’n Vergadering voor 08:00 kry die herinnering die oggend tevore.</li>
</ul>
<h3>Het jy ’n lokaal nodig wat iemand reeds het?</h3>
<p>Klik op hul bespreking en vra daarvoor, met ’n rede. Hulle kry ’n e-pos en besluit. Niks verander tensy hulle ja sê nie.</p>
<div class="note">
  <span class="lbl">Kan jy nie Lokale sien nie?</span>
  <p>Om lokale te bespreek en te bestuur is toestemmings. ’n Administrateur merk dit onder <span class="ui">Admin</span>, <span class="ui">Rolle</span>.</p>
</div>`,
    },
    {
      title: "Hou almal ingelig",
      html: `
<p class="lede">Twee e-posse wat die opvolgwerk vir jou doen.</p>
<h3>Die weeklikse bywerking</h3>
<p>Onder <span class="ui">Admin</span>, <span class="ui">Weeklikse bywerking</span>: een e-pos per week aan elke portaalgebruiker, met oop aksiepunte, besteding wat op goedkeuring wag, wie nog nie aangemeld het nie, en notules wat nog op handtekeninge wag. Kies die dag en tyd, merk <span class="ui">Stuur die weeklikse bywerking outomaties</span> en stoor. Niks word gestuur voordat jy dit doen nie.</p>
<h3>Die opsomming van aksiepunte</h3>
<p>Onder <span class="ui">Admin</span>, <span class="ui">Aksie-opsomming-e-pos</span>: die volle oop register as ’n Excel-werkboek, op ’n skedule wat jy kies, aan die mense en etikette wat jy kies. ’n Etiket word met elke stuur opgesoek, so iemand wat volgende maand die etiket kry, is op die volgende een.</p>
<div class="note">
  <span class="lbl">Probeer dit eers op jouself</span>
  <p>Albei bladsye laat jou ’n voorskou aan jouself e-pos voordat enigiets na die hele ${body} gaan.</p>
</div>`,
    },
    {
      title: "Mense, gebruikers en etikette",
      html: `
<p class="lede">Drie verskillende dinge wat maklik verwar word.</p>
<ul>
  <li>’n <strong>Persoon</strong> is op die ${body}-register. Hulle beklee ’n posisie en het ’n e-posadres. Hulle het dalk glad nie ’n aanmelding nie.</li>
  <li>’n <strong>Gebruiker</strong> kan by die portaal aanmeld. Wat hulle kan doen, word bepaal deur hul <strong>rol</strong>, onder <span class="ui">Admin</span>, <span class="ui">Rolle</span>.</li>
  <li>’n <strong>Etiket</strong> noem ’n groep mense, en dit bepaal wie besteding goedkeur en wie watter notules ontvang.</li>
</ul>
<p>’n Etiket kan op ’n persoon of op ’n gebruiker wees, so iemand sonder ’n aanmelding kan steeds die notule ontvang. Etikette word gestel onder <span class="ui">Admin</span>, <span class="ui">Etikette</span>, en toegepas vanaf <span class="ui">Admin</span>, <span class="ui">Mense en posisies</span> of <span class="ui">Gebruikers</span>.</p>
<div class="careful">
  <span class="lbl">Stel jou notule-etikette op voor die eerste vergadering</span>
  <p>Onder <span class="ui">Admin</span>, <span class="ui">Notule-admin</span>, sê watter etiket ’n konsep nagaan, watter teken, en wie die ondertekende notule ontvang. Om ’n konsep te stuur of ondertekening oop te maak, sal weier totdat dié bestaan, en dit noem die instelling wat reggestel moet word eerder as om in die niet in te stuur.</p>
</div>`,
    },
    {
      title: "Laat dit soos jou skool lyk",
      html: `
<p class="lede">Jou wapen en jou kleure.</p>
<p>Onder <span class="ui">Admin</span>, <span class="ui">Skoolhandelsmerk</span>:</p>
<ul>
  <li><strong>Jou wapen</strong>, wat op die aanmeldbladsy verskyn, in die kantbalk, op elke e-pos wat die portaal stuur en bo-aan jou Word-notules.</li>
  <li><strong>Twee kleure</strong>, ’n hoofkleur en ’n aksentkleur. Alles anders word daaruit bereken, insluitend om seker te maak teks bly leesbaar op jou hoofkleur.</li>
  <li><strong>’n Antwoordadres</strong>, sodat iemand wat op ’n portaal-e-pos antwoord, ’n posbus bereik wat ’n mens lees.</li>
</ul>
<div class="note">
  <span class="lbl">Totdat jy ’n wapen oplaai</span>
  <p>Die portaal wys ’n eenvoudige merk eerder as om te raai. Dit sal nooit ’n ander skool se wapen wys nie.</p>
</div>`,
    },
    {
      title: "Hou ’n rekord",
      html: `
<p class="lede">Wat gebeur het, wat gestuur is, en ’n afskrif van alles.</p>
<ul>
  <li><strong>Aktiwiteitslog</strong> lys elke handeling in die portaal, wie dit gedoen het en wanneer, insluitend aanmeldings. Dit is die rekord waarvoor ’n ouditeur vra.</li>
  <li><strong>Gestuurde e-posse</strong> lys elke e-pos wat die portaal gestuur het, aan wie dit gegaan het en of dit aanvaar is. Kodes en private skakels word uitgevee.</li>
  <li><strong>Rugsteun data</strong> laai ’n volledige afskrif van jou skool se data af as ’n ZIP-lêer: gebruikers, beleide, dokumente, toetse, besteding en instellings.</li>
</ul>
<div class="note">
  <span class="lbl">Iemand sê hulle het nooit ’n e-pos gekry nie?</span>
  <p>Soek hulle eers op in <span class="ui">Gestuurde e-posse</span>. As dit aanvaar is, het dit hul e-posstelsel bereik, so vra hulle om in die gemorsvouer te kyk.</p>
</div>`,
    },
    {
      title: "E-posse wat die portaal stuur",
      html: `
<p class="lede">Alles wat die portaal namens die skool stuur.</p>
<div class="tw">
<table>
  <thead><tr><th>E-pos</th><th>Gaan na</th><th>Wanneer</th></tr></thead>
  <tbody>
    <tr><td>Welkom</td><td>’n Nuwe gebruiker</td><td>Hul rekening word geskep</td></tr>
    <tr><td>Stel jou wagwoord</td><td>’n Gebruiker</td><td>Hulle gebruik Wagwoord vergeet, of ’n administrateur stuur ’n skakel</td></tr>
    <tr><td>Goedkeuring nodig</td><td>Elke vereiste goedkeurder</td><td>’n Aansoek om fondse word ingedien</td></tr>
    <tr><td>Besluit aangeteken</td><td>Die aansoeker</td><td>Elke goedkeurder besluit</td></tr>
    <tr><td>Notule om na te gaan</td><td>Almal op die konseplys</td><td>’n Konsep word gestuur om na te gaan</td></tr>
    <tr><td>Veranderinge gevra</td><td>Die sekretaris</td><td>’n Naganer stuur ’n konsep terug</td></tr>
    <tr><td>Jou ondertekeningskode</td><td>Elke ondertekenaar</td><td>Ondertekening gaan oop, of ’n kode word weer gestuur</td></tr>
    <tr><td>Ondertekende notule</td><td>Die ${body}</td><td>Die laaste handtekening kom in, of iemand stuur dit met die hand</td></tr>
    <tr><td>Aksie toegeken</td><td>Die mense aan wie dit toegeken is</td><td>’n Aksie word geopper of hertoegeken</td></tr>
    <tr><td>Aksieherinnering</td><td>Wie ook al die aksie opvolg</td><td>Voor die sperdatum, dan herhalend</td></tr>
    <tr><td>Lokaal bespreek of verander</td><td>Die persoon vir wie die lokaal bespreek is</td><td>’n Bespreking word gemaak, verander of gekanselleer</td></tr>
    <tr><td>Lokaalherinnering</td><td>Die persoon vir wie die lokaal bespreek is</td><td>07:00 op die dag van die vergadering</td></tr>
    <tr><td>Kan hulle die lokaal kry?</td><td>Wie ook al die bespreking het</td><td>Iemand vra vir hul tydgleuf</td></tr>
    <tr><td>Weeklikse bywerking</td><td>Elke portaalgebruiker</td><td>Die dag en tyd wat jy gekies het</td></tr>
    <tr><td>Opsomming van aksiepunte</td><td>Die mense en etikette wat jy gekies het</td><td>Die skedule wat jy gekies het</td></tr>
  </tbody>
</table>
</div>
<div class="careful">
  <span class="lbl">Antwoorde bereik ons nie by verstek nie</span>
  <p>Portaal-e-pos word gestuur vanaf ’n adres wat nie e-pos ontvang nie. Stel ’n <strong>antwoordadres</strong> onder <span class="ui">Admin</span>, <span class="ui">Skoolhandelsmerk</span> sodat ’n antwoord iemand by ${school} bereik.</p>
</div>`,
    },
  ],
};
