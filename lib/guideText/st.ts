import type { GuideText } from "./types";

// Sesotho translation of en.ts. Keep the chapters, tags and class names in step with en.ts.
export const st: GuideText = {
  title: "Tataiso ya Portal",
  standfirst:
    "Tsela ya ho sebedisa portal: moo dipholisi di bolokwang teng, kamoo pholisi e hlahlojwang kateng kgahlanong le molao, kamoo ditjhelete di kopuwang le ho dumellwa kateng, kamoo metsotso ya kopano e ngolwang, e hlahlojwang, e saenwang le ho fetolwa diketso kateng, le kamoo diphaposi di behellwang kateng. E ngoletswe babusi, e seng ditsebi tsa dikhomputara.",
  chapter: "Kgaolo",
  contents: "Diteng",
  edition: "Kgatiso",
  standard: "E tlwaelehileng",
  covers: (n) => `E na le dikgaolo tse ${n}`,
  chapters: (school, body) => [
    {
      title: "Ho kena",
      html: `
<p class="lede">Motho e mong le e mong ya sebedisang portal o na le ho kena ha hae. Ha ho phasewete eo le e arolelanang.</p>
<ol class="steps">
  <li>Eya atereseng ya portal ya sekolo sa hao mme o kene ka aterese ya hao ya imeile.</li>
  <li>Na ke lekgetlo la pele, kapa o e lebetse? Sebedisa <span class="ui">Na o lebetse phasewete ya hao?</span> leqepheng la ho kena. Lehokela le fihla ka imeile mme le sebetsa nako e ka bang hora.</li>
  <li>Lehokela le sebetsa hanngwe feela. Hang ha o beha phasewete le a emisa, ka hona kopa le letjha ho e na le ho sebedisa imeile ya kgale hape.</li>
</ol>
<div class="note">
  <span class="lbl">Ha ho letho le fihlileng?</span>
  <p>Sheba foldara ya junk pele. Ditsamaiso tsa imeile tsa dikolo di a hlokolosa ka imeile e tswang atereseng eo di sa e tsebeng. Haeba e le siyo, kopa motsamaisi hore a hlahlobe aterese e bolokilweng bakeng sa hao tlasa <span class="ui">Admin</span>, <span class="ui">Basebedisi</span>: lehokela le rometsweng atereseng eo ho seng motho ya e balang le shebahala hantle jwalo ka lehokela le sa kang la romelwa.</p>
</div>`,
    },
    {
      title: "Ho tseba tsela ya hao",
      html: `
<p class="lede">Lenane le ka lehlakoreng ke portal yohle. Seo o se bonang se itshetlehile ka seo o dumelletsweng ho se etsa.</p>
<ul>
  <li><strong>Dashboard</strong> ke kakaretso: diketso tse so phethwang, tshebediso e emetseng tumello, le ditlhahlobo tsa haufinyane tsa ho latela melao.</li>
  <li><strong>Batho</strong> ke rejisetara ya ${body}: ke mang ya tshwereng maemo afe hona jwale.</li>
  <li><strong>Diketso</strong> e bontsha hore ke mang ya dumetseng ho etsa eng, le ka nako efe.</li>
  <li><strong>Metsotso ya Dikopano</strong> ke moo metsotso e ngolwang, e hlahlojwang le ho saenwa teng.</li>
  <li><strong>Tataiso</strong> ke tokomane ena.</li>
  <li><strong>Dipholisi</strong>, <strong>Ho latela melao</strong> le <strong>Ditokomane</strong> di boloka ditokomane tsa puso le ditlhahlobo tse di etsetswang tsona.</li>
  <li><strong>Tshebediso</strong> ke dikopo tsa ditjhelete, ditheko, ditumello le ditlaleho tsa tekanyetso ya ditjhelete.</li>
  <li><strong>Diphaposi</strong> ke khalendara ya diphaposi tsa dikopano.</li>
  <li><strong>Admin</strong> ke tsohle tse hlophiswang hanngwe: basebedisi, dikarolo, matshwao, letshwao la sekolo, di-imeile le ditlhophiso.</li>
</ul>
<p>Haeba leqephe leo o le lebeletseng le le siyo, ke taba ya tumello, ha se phoso. Motsamaisi a ka o fa yona tlasa <span class="ui">Admin</span>, <span class="ui">Dikarolo</span>.</p>`,
    },
    {
      title: "Ho bala portal ka puo ya hao",
      html: `
<p class="lede">Portal e bua dipuo tse supileng: Senyesemane, Seafrikanse, isiZulu, isiXhosa, Sepedi, Setswana le Sesotho.</p>
<p>Kgetha puo ya hao lebokoseng le ka hodimo ka letsohong le letona la leqephe lefe kapa lefe, esita le leqephe la ho kena. Konopo e nngwe le e nngwe, lebitso, molaetsa le tataiso ena di fetoha hang hang, mme portal e hopola kgetho ya hao sesebedisweng seo. Sena ha se lefellwe.</p>
<h3>Ditokomane tsa sekolo sa hao</h3>
<p>Pholisi kapa metsotso e ngotswe ke sekolo sa hao, ka hona ha ho bukantswe e e tsebang esale pele. Tsona di fetolelwa ha di kopuwa mme di lefellwa ka dikhrediti tsa phetolelo.</p>
<ul>
  <li>Dikhrediti di bitsa R100 bakeng sa tse 10 mme ha di fele nako. Di odare tlasa <span class="ui">Admin</span>, <span class="ui">Dikhrediti tsa Phetolelo</span>.</li>
  <li>Khrediti e le nngwe e fetolela maqephe a ka fihlang ho a 10 a tokomane e le nngwe ho puo e le nngwe.</li>
  <li>Hang ha tokomane e fetoletswe, bohle sekolong sa hao ba e bala ka puo eo mahala.</li>
</ul>
<div class="note">
  <span class="lbl">Ke mang ya ka sebedisang dikhrediti</span>
  <p>Ha ho motho ya ka sebedisang dikhrediti ho fihlela motsamaisi a tshwaya <span class="ui">A ka sebedisa dikhrediti tsa phetolelo</span> ho motho eo tlasa <span class="ui">Admin</span>, <span class="ui">Basebedisi</span>.</p>
</div>`,
    },
    {
      title: "Batho ba rona",
      html: `
<p class="lede">Ke mang ya leng ho ${body} ya hao hona jwale, le maemong afe.</p>
<p><span class="ui">Batho</span> e bontsha bohle ba rejisetareng jwalo ka karete e nang le maemo a bona le aterese ya imeile, mme o ka batla ka lebitso kapa ka maemo. Ke karabo ya potso e reng "ke mang mmoloki wa ditjhelete selemong sena?"</p>
<ol class="steps">
  <li>E boloke e le ya morao tjena tlasa <span class="ui">Admin</span>, <span class="ui">Batho le Maemo</span>. E ntlafatse ka lona letsatsi leo motho a kenang kapa a tsamayang ka lona.</li>
  <li>Lenane la maemo, le tatellano eo leqephe le balwang ka yona, di behwa tlasa <span class="ui">Admin</span>, <span class="ui">Mefuta ya Batho</span>.</li>
</ol>
<div class="note">
  <span class="lbl">Motho ha a hloke ho kena</span>
  <p>Motho ya rejisetareng a ka fumana metsotso le dikhopotso ka imeile ntle le ho kena le ka mohla. Mo fe ho kena feela haeba a hloka ho sebedisa portal.</p>
</div>`,
    },
    {
      title: "Dipholisi",
      html: `
<p class="lede">Pholisi e nngwe le e nngwe ya puso sebakeng se le seng, le nalane ya yona yohle.</p>
<p>Kenya pholisi mme portal e e boloka le nalane ya diphetolelo tsa yona, kahoo kopi eo ${body} e e dumetseng ka Hlakubele e ntse e le teng ka mora hore e fetolwe ka Lwetse. Ha ho letho le ngolwang hodima e nngwe mme ha ho letho le lahlehang.</p>
<ol class="steps">
  <li><span class="ui">Dipholisi</span>, ebe <span class="ui">Kenya Pholisi</span>.</li>
  <li>E fe lebitso leo motho a ka le batlang, e seng lebitso la faele, mme o kgethe sehlopha.</li>
  <li>Ho nkela pholisi e teng sebaka ho eketsa phetolelo e ntjha, ha ho etse pholisi ya bobedi.</li>
</ol>
<p>Dihlopha (Ditjhelete, Puso, Polokeho le tse ding) ke tsa hao ho di fetola tlasa <span class="ui">Admin</span>, <span class="ui">Dihlopha tsa Dipholisi</span>.</p>`,
    },
    {
      title: "Ho etsa tlhahlobo ya ho latela melao",
      html: `
<p class="lede">Kenya tokomane mme o fumane dintlha tsa ho latela melao kgahlanong le molao wa thuto wa Afrika Borwa, le dikgaello di thathamisitswe ka bonngwe.</p>
<p>Ditlhahlobo di etswa kgahlanong le <strong>BELA Act</strong>, <strong>SASA</strong> le melawana ya provense. O fumana dintlha, mme ka tlase ho tsona dikgaello tse fumanweng: kabelo ya matla e sa ngolwang, qeto ya selemo e siyo, kapa molao wa boitshwaro o seng wa kgale.</p>
<ul>
  <li>Hlahloba pholisi hang leqepheng la yona ka <span class="ui">Etsa Tlhahlobo ya ho Latela Melao</span>, kapa o kenye faele efe kapa efe tlasa <span class="ui">Ho latela melao</span>, <span class="ui">Etsa Tlhahlobo</span>.</li>
  <li>Ditokomane tseo e seng dipholisi, jwalo ka konteraka kapa morero, di ya tlasa <span class="ui">Ditokomane</span> mme di hlahlojwa ka tsela e tshwanang.</li>
</ul>
<h3>Ditataiso tsa hao</h3>
<p>Tlasa <span class="ui">Ho latela melao</span>, <span class="ui">Ditataiso</span> o ka kenya melao eo tlhahlobo e lokelang ho e lekanya le yona: lengolo la provense, kapa bakeng sa sekolo se ikemetseng, melao ya boto ya hao. Tlhahlobo e nngwe le e nngwe ka mora moo e tla e ela hloko.</p>
<div class="careful">
  <span class="lbl">Seo tlhahlobo e leng sona le seo e seng sona</span>
  <p>E bontsha dikgaello kgahlanong le molao. Ha e etse hore sekolo se latele melao, mme hase keletso ya molao. Molemo wa yona ke hore motho a ka e etsa ka Labobedi thapama ho e na le ho fumana dikgaello tseo ka nako ya odithi.</p>
</div>
<p>Tlhahlobo e nngwe le e nngwe e a bolokwa, kahoo dintlha di ka bapiswa ka mora hore pholisi e fetolwe.</p>`,
    },
    {
      title: "Ho kopa ditjhelete",
      html: `
<p class="lede">Kamoo projeke e kopang ditjhelete ho ${body} kateng.</p>
<p>Kopo e nngwe le e nngwe e feta foromong e le nngwe, ho sa kgathalatsehe palo. Ditjhelete tse nyane di a ngolwa feela ho e na le ho romelwa bakeng sa tumello, empa di feta monyako o le mong, kahoo sekolo se qetella se na le rekoto e le nngwe e phethehileng ya se sebedisitsweng le lebaka.</p>
<ul>
  <li><strong>Projeke le seo e leng sa yona.</strong> E ngolle motho ya neng a le siyo kopanong.</li>
  <li><strong>Palo e lekantsweng.</strong> Ena e etsa qeto ya hore e wela sehlopheng sefe sa tumello.</li>
  <li><strong>Moo ditjhelete di tswang teng.</strong> Kopo e le nngwe e ka arolelwa mehloding e mmalwa.</li>
  <li><strong>Ditheko.</strong> Di hokele mme o ngole hore ke mofani ofe ya kgethilweng.</li>
</ul>`,
    },
    {
      title: "Ho dumella tshebediso",
      html: `
<p class="lede">Hore na ke mang ya lokelang ho dumella kopo ho etswa qeto ke palo ya yona, mme ho behwa hanngwe.</p>
<p>Tlasa <span class="ui">Admin</span>, <span class="ui">Ditlhophiso tsa Tumello</span>, dihlopha tsa dipalo di hokahanngwa le dihlopha tsa batho. Ka tlase ho palo e nngwe kopo e a ngolwa feela; ka hodimo ho e nngwe e ya komiting ya ditjhelete. Beha dihlopha hanngwe mme kopo e nngwe le e nngwe ka mora moo e itsamaisa.</p>
<div class="careful">
  <span class="lbl">Badumedi ba a TSITSWA ha kopo e romelwa</span>
  <p>Mang kapa mang ya neng a hlokahala ha e romelwa o dula a hlokahala. Komiti e fumanang setho se setjha bekeng e tlang ha e bule hape kopo eo qeto ya yona e seng e entswe.</p>
</div>
<p>Badumedi ke batho ba nang le mabitso ba leng ho <strong>letshwao</strong>, e seng boemo ba mosebetsi, hobane matla a ho dumella ke a motho, e seng a karolo.</p>`,
    },
    {
      title: "Tekanyetso ya ditjhelete le ditlaleho tsa tshebediso",
      html: `
<p class="lede">${body} e beheletse bokae, ho tshepisitswe bokae, mme ho sebedisitswe bokae.</p>
<p>Tlasa <span class="ui">Admin</span>, <span class="ui">Ditlhophiso tsa Tshebediso</span>, beha selemo sa tekanyetso, tekanyetso yohle ya CAPEX le kgwedi eo selemo sa hao sa ditjhelete se felang ka yona. Mehlodi ya ditjhelete (CAPEX, ho bokella ditjhelete le tse ding) e thathamisitswe moo hape, mme o ka eketsa ya hao.</p>
<p><span class="ui">Tshebediso</span>, <span class="ui">Ditlaleho</span> ebe e bontsha:</p>
<ul>
  <li><strong>Tekanyetso kgahlanong le tshebediso:</strong> tekanyetso, se tshepisitsweng (se dumelletsweng) le se sebedisitsweng ka nnete (se phethilweng).</li>
  <li><strong>Mohlodi o mong le o mong wa ditjhelete:</strong> se kopuweng, se tshepisitsweng le se sebedisitsweng.</li>
  <li><strong>Projeke e nngwe le e nngwe:</strong> ke mang ya kopileng, bokae, ditheko, mofani le hore e fihlile kae.</li>
</ul>
<p><span class="ui">Romela kantle ho Excel</span> e fa mmoloki wa ditjhelete dipalo tse tshwanang jwalo ka spreadsheet.</p>`,
    },
    {
      title: "Ho ngola metsotso",
      html: `
<p class="lede">Moo rekoto ya kopano e ngolwang teng, le se etsang hore e be tokomane ya sekolo.</p>
<p>Bula <span class="ui">Metsotso ya Dikopano</span> mme o kgethe <span class="ui">Eketsa metsotso</span>. Ho na le ditsela tse pedi tsa ho qala mme ka bobedi di fihla sebakeng se le seng.</p>
<h3>Ho qala ka template</h3>
<p>Template ke sebopeho sa kopano: dikarolo tseo ${body} ya hao e di buang kamehla, ka tatellano, le mantswe a tlwaelehileng a se a ngotswe. Lenane la ba teng le fetoha hanyane feela, kahoo le dula ho template mme le a fetolwa ho e na le ho ngolwa bocha. Di-template di etswa tlasa <span class="ui">Admin</span>, <span class="ui">Admin ya Metsotso</span>.</p>
<ol class="steps">
  <li>Kgetha <span class="ui">Di ngole mona</span> mme o kgethe template.</li>
  <li>Fa metsotso lebitso, kgetha kopano, mme o behe nako. Nako e ka ba kgwedi, kotara, kapa matsatsi ao o a kgethang.</li>
  <li>Ngola karolong e nngwe le e nngwe. Karolo e nngwe le e nngwe e na le sehlooho, se buisanweng, le ya ikarabellang.</li>
</ol>
<div class="note">
  <span class="lbl">Hobaneng dinomoro di qala bohareng</span>
  <p>Ba teng le ba kopileng tshwarelo ha se ntlha e nang le nomoro, kahoo dinomoro hangata di qala karolong ya bobedi kapa ya boraro. Ya hlophisang template o etsa qeto ya hore ke karolo efe e leng nomoro 1.</p>
</div>
<h3>Ho kenya metsotso eo o seng o na le yona</h3>
<p>Haeba mongodi a ngola ka Word, kgetha <span class="ui">Kenya faele</span>. Faele e bolokwa kamoo e leng kateng, mme metsotso e ntse e ka hlahlojwa le ho saenwa.</p>
<h3>Tokomane ya Word</h3>
<p><span class="ui">Theolla jwalo ka Word</span> e etsa tokomane ya ho hatiswa kapa ho abelwa. Letshwao la sekolo sa hao le hodimo, mme metsotso e latela tafoleng e nang le dinomoro e lekanang le leqephe.</p>`,
    },
    {
      title: "Ho romela moralo hore o hlahlojwe",
      html: `
<p class="lede">Pele motho a saena, moralo o ya ho batho ba o hlahlobang.</p>
<p>Tobetsa <span class="ui">Romela moralo 1 hore o hlahlobwe</span>. Motho e mong le e mong ya lenaneng la meralo la sekolo o romellwa lehokela ka imeile, o bula metsotso, mme o e dumella kapa o e kgutlisa.</p>
<ul>
  <li><strong>Dumella</strong> e bolela hore moralo ke rekoto e nepahetseng ya kopano.</li>
  <li><strong>Kgutlisa</strong> e kopa diphetoho mme <strong>e hloka ntlha e ngotsweng</strong>. Ntle le yona mongodi o bolellwa feela hore motho ha a kgotsofala.</li>
</ul>
<p>Ha motho a le mong a o kgutlisa, moralo wohle o kgutla hang. Ha ho na thuso ho bokella ditumello tse ding bakeng sa tokomane e seng e ngolwa bocha.</p>
<div class="careful">
  <span class="lbl">Tumello ke ya moralo oo e o arabileng</span>
  <p>Metsotso e ngotsweng bocha ke moralo o motjha mme e hloka ditumello tsa yona. Tse fetileng di dula rekotong jwalo ka nalane empa ha di balwe. Ha ho motho ya lokelang ho ya ho saena a tshwere ditumello tsa phetolelo eo ho seng motho ya e badileng.</p>
</div>
<div class="note">
  <span class="lbl">Ha o hloke ho ba motsamaisi ho hlahloba moralo</span>
  <p>Se etsang qeto ke ho ba lenaneng leo moralo o rometsweng ho lona, ha ho letho le leng.</p>
</div>`,
    },
    {
      title: "Ho saena metsotso",
      html: `
<p class="lede">Ho saena ho etswa tokomaneng ka boyona, jwalo ka ho Adobe kapa SignNow.</p>
<p>Motho e mong le e mong ya saenang o romellwa <strong>khoutu ya hae ya ditlhaku tse tsheletseng</strong> ka imeile. Lehokela le bula tokomane yohle, mme ho saena ho ka tlase ho yona, kahoo o feta ho seo o se dumelang ha o ntse o theohela teng.</p>
<ol class="steps">
  <li>Bula lehokela mme o bale metsotso.</li>
  <li>Saena: <strong>thala</strong> ka monwana kapa ka mouse, kapa <strong>thaepa</strong> lebitso la hao ka mongolo wa tshaeno. Ka tsela efe kapa efe e hlaha faeleng ya Word.</li>
  <li>Thaepa khoutu e imeileng ya hao mme o netefatse.</li>
</ol>
<div class="careful">
  <span class="lbl">Khoutu ke yona ntlha ya bohlokwa</span>
  <p>E ile atereseng ya hao, eseng ya motho e mong, ha e bolokwe ka tsela eo motho a ka e balang hape, mme e sebediswa hanngwe feela. O se ke wa e romella motho e mong hore a saene lebitsong la hao: rekoto e tla re ke wena ya saenneng.</p>
</div>
<h3>Tshupiso ya tokomane</h3>
<p>Tshaeno e nngwe le e nngwe e boloka monwana wa mantswe hantle a saennweng, o bontshwang metsotsong jwalo ka tshupiso e kgutshwane. Kopi e etswang selemong se tlang e ka hlahlojwa kgahlanong le yona. Haeba tshaeno e ka emisa ho tshwana, portal e e bolela ka ho hlaka ho e na le ho e bala bocha ka sephiring, hobane seo ke bopaki ba hore rekoto e fetotswe ka mora ho saenwa.</p>
<h3>Ho saena pampiring</h3>
<p>Theolla faele ya Word, saena ka letsoho, mme o kenye skene ka <span class="ui">Kenya kopi e saennweng</span>. Seo se kwala metsotso ka tsela e tshwanang mme se boloka monwana o tshwanang.</p>
<h3>Ho romela metsotso e saennweng</h3>
<p>Ha tshaeno ya ho qetela e fihla, metsotso e saennweng e ya ho bohle ba lenaneng la kabo ka bo yona. Ho boetse ho na le konopo ya <span class="ui">Romela ho lekgotla la taolo</span>, e bolelang hantle hore e tla fihla ho mang pele o e tobetsa.</p>
<div class="note">
  <span class="lbl">Sebedisa konopo haeba o saennwe pampiring</span>
  <p>Metsotso e kwetsweng ka ho kenya skene ha e fete mohatong wa ho saena ka elektroniki, kahoo ha ho letho le e romelang ka bo yona. Konopo ke yona tsela eo e fihlang ho ${body} ka yona, le tsela ya ho romela hape haeba aterese e kgutlisitse imeile.</p>
</div>
<div class="careful">
  <span class="lbl">Metsotso e saennweng e ke ke ya fetolwa</span>
  <p>Hang ha ditshaeno tsohle di kene, rekoto e a kwalwa. Lokisa eng kapa eng metsotsong e latelang. Ke sona se etsang hore tshaeno e be le bohlokwa.</p>
</div>`,
    },
    {
      title: "Diketso",
      html: `
<p class="lede">Rejisetara ya hore ke mang ya dumetseng ho etsa eng, le ka nako efe.</p>
<p><span class="ui">Diketso</span> ke tafole e le nngwe ya tsohle tse so phethwang, le mong wa yona, letsatsi le hore e fihlile kae. Mang kapa mang ya kenang a ka e bona, hobane motho ya sa boneng ketso ya hae a ke ke a e etsa.</p>
<h3>Ho hlahisa ketso ho tswa metsotsong</h3>
<p>Ena ke tsela e nepahetseng. Bula metsotso mme o sebedise <span class="ui">Hlahisa ketso</span>, kapa o kgethe ntlha eo e tswileng ho yona. Sehlooho le mantswe a metsotso di a fetela, kahoo o fetola ho e na le ho ngola bocha seo kopano e se dumetseng.</p>
<p>Ketso ebe e bontsha hore ke kopano efe e e dumetseng mme e hokahana le yona. Metsotso e thathamisa ketso e nngwe le e nngwe e tswileng ho yona. Ha ho lenane le leng le ka fapaneng le le leng.</p>
<div class="note">
  <span class="lbl">Metsotso e saennweng ke sebaka se setle ka ho fetisisa sa ho hlahisa diketso</span>
  <p>Ho hlahisa ketso ha ho fetole letho metsotsong, mme rekoto e saennweng ke polelo e tshepahalang ka ho fetisisa ya se dumelletsweng.</p>
</div>
<h3>Ho di latela</h3>
<p>Portal e romela khopotso ka imeile matsatsi a itseng pele ho letsatsi la ho qetela mme e ka e pheta ho fihlela ketso e kwalwa. O kgetha hore ke mang ya hopotswang. Ha ho motho ya lokelang ho hopola ho hlohlelletsa ba bang.</p>
<p>Dihlopha tseo ketso e ka bolokwang ka tlasa tsona di behwa tlasa <span class="ui">Admin</span>, <span class="ui">Dihlopha tsa Diketso</span>.</p>`,
    },
    {
      title: "Ho behella phaposi ya kopano",
      html: `
<p class="lede">Phaposi ya boto le holo khalendareng e le nngwe e arolelanwang, kahoo dikopano tse pedi ha di kopane phaposing e le nngwe.</p>
<ol class="steps">
  <li>Motsamaisi o kenya diphaposi hanngwe tlasa <span class="ui">Diphaposi</span>, <span class="ui">Diphaposi tsa Dikopano</span>.</li>
  <li>Bula <span class="ui">Diphaposi</span>, <span class="ui">Dipehelo</span>, kgetha phaposi, mme o tobetse nako e lokolohileng khalendareng ya beke.</li>
  <li>Fa kopano lebitso le nako. O ka behella lebitsong la motho e mong.</li>
</ol>
<ul>
  <li><strong>Dikgohlano di a tshwarwa</strong> pele di etsahala: nako e seng e nkuwe e ke ke ya behellwa habedi.</li>
  <li><strong>Pheta pehelo</strong> letsatsi le letsatsi, beke le beke kapa kgwedi le kgwedi, ho fihla ho makgetlo a 52. Fetola kopano e le nngwe letotong, kapa o hlakole ena le tsohle tse latelang. Dikopano tse fetileng di a bolokwa.</li>
  <li><strong>Dikhopotso</strong> di romelwa ka imeile ka 07:00 ka letsatsi la kopano. Kopano e pele ho 08:00 e hopotswa hoseng ha letsatsi le fetileng.</li>
</ul>
<h3>O hloka phaposi eo motho e mong a seng a na le yona?</h3>
<p>Tobetsa pehelo ya hae mme o e kope, o fane ka lebaka. O fumana imeile mme o etsa qeto. Ha ho letho le fetohang ntle le hore a re e.</p>
<div class="note">
  <span class="lbl">Ha o bone Diphaposi?</span>
  <p>Ho behella le ho laola diphaposi ke ditumello. Motsamaisi o di tshwaya tlasa <span class="ui">Admin</span>, <span class="ui">Dikarolo</span>.</p>
</div>`,
    },
    {
      title: "Ho tsebisa bohle",
      html: `
<p class="lede">Di-imeile tse pedi tse o latelang batho bakeng sa hao.</p>
<h3>Ntlafatso ya beke le beke</h3>
<p>Tlasa <span class="ui">Admin</span>, <span class="ui">Ntlafatso ya Beke le Beke</span>: imeile e le nngwe ka beke ho mosebedisi e mong le e mong wa portal, e nang le diketso tse so kwalwang, tshebediso e emetseng tumello, ba so kang ba kena, le metsotso e ntseng e emetse ditshaeno. Kgetha letsatsi le nako, tshwaya <span class="ui">Romela ntlafatso ya beke le beke ka bo yona</span> mme o boloke. Ha ho letho le romelwang ho fihlela o etsa jwalo.</p>
<h3>Kakaretso ya diketso</h3>
<p>Tlasa <span class="ui">Admin</span>, <span class="ui">Imeile ya Kakaretso ya Diketso</span>: rejisetara yohle e bulehileng jwalo ka buka ya Excel, ka lenane la nako leo o le kgethang, ho batho le matshwao ao o a kgethang. Letshwao le shebuwa nako le nako ha ho romelwa, kahoo motho ya tshwauwang kgweding e tlang o tla ba ho e latelang.</p>
<div class="note">
  <span class="lbl">E leke ho wena pele</span>
  <p>Maqephe ka bobedi a o dumella ho iromella ponelopele ka imeile pele ho letho le ya ho ${body} yohle.</p>
</div>`,
    },
    {
      title: "Batho, basebedisi le matshwao",
      html: `
<p class="lede">Dintho tse tharo tse fapaneng tse bonolo ho ferekanngwa.</p>
<ul>
  <li><strong>Motho</strong> o rejisetareng ya ${body}. O tshwere maemo mme o na le aterese ya imeile. A ka nna a se be le ho kena ho hang.</li>
  <li><strong>Mosebedisi</strong> a ka kena portal. Seo a ka se etsang se behwa ke <strong>karolo</strong> ya hae, tlasa <span class="ui">Admin</span>, <span class="ui">Dikarolo</span>.</li>
  <li><strong>Letshwao</strong> le fa sehlopha sa batho lebitso, mme ke lona le etsang qeto ya hore ke mang ya dumellang tshebediso le hore ke mang ya fumanang metsotso efe.</li>
</ul>
<p>Letshwao le ka ba ho motho kapa ho mosebedisi, kahoo motho ya se nang ho kena a ntse a ka fumana metsotso. Matshwao a behwa tlasa <span class="ui">Admin</span>, <span class="ui">Matshwao</span>, mme a sebediswa ho tswa ho <span class="ui">Admin</span>, <span class="ui">Batho le Maemo</span> kapa <span class="ui">Basebedisi</span>.</p>
<div class="careful">
  <span class="lbl">Hlophisa matshwao a metsotso pele ho kopano ya pele</span>
  <p>Tlasa <span class="ui">Admin</span>, <span class="ui">Admin ya Metsotso</span>, bolela hore ke letshwao lefe le hlahlobang moralo, lefe le saenang, le hore ke mang ya fumanang metsotso e saennweng. Ho romela moralo kapa ho bula ho saena ho tla hana ho fihlela tseo di le teng, mme ho tla bolela tlhophiso e lokelang ho lokiswa ho e na le ho romela lefeela.</p>
</div>`,
    },
    {
      title: "Ho etsa hore e shebahale jwalo ka sekolo sa hao",
      html: `
<p class="lede">Letshwao la hao le mebala ya hao.</p>
<p>Tlasa <span class="ui">Admin</span>, <span class="ui">Letshwao la Sekolo</span>:</p>
<ul>
  <li><strong>Letshwao la hao</strong>, le hlahang leqepheng la ho kena, lenaneng le ka lehlakoreng, imeileng e nngwe le e nngwe eo portal e e romelang le ka hodimo ho metsotso ya hao ya Word.</li>
  <li><strong>Mebala e mmedi</strong>, o ka sehloohong le o tlatsetsang. Tse ding tsohle di sebetswa ho tswa ho yona, ho kenyeletswa ho netefatsa hore mongolo o dula o baleha hodima mmala wa hao o ka sehloohong.</li>
  <li><strong>Aterese ya ho araba</strong>, kahoo motho ya arabang imeile ya portal o fihla lebokoseng la imeile leo motho a le balang.</li>
</ul>
<div class="note">
  <span class="lbl">Ho fihlela o kenya letshwao</span>
  <p>Portal e bontsha letshwao le bonolo ho e na le ho hakanya. E ke ke ya bontsha letshwao la sekolo se seng le ka mohla.</p>
</div>`,
    },
    {
      title: "Ho boloka rekoto",
      html: `
<p class="lede">Se etsahetseng, se rometsweng, le kopi ya tsohle.</p>
<ul>
  <li><strong>Rekoto ya Mesebetsi</strong> e thathamisa ketso e nngwe le e nngwe e entsweng portal, ke mang ya e entseng le neng, ho kenyeletswa ho kena. Ke rekoto eo mohlahlobi wa dibuka a e kopang.</li>
  <li><strong>Di-imeile tse rometsweng</strong> e thathamisa imeile e nngwe le e nngwe eo portal e e rometseng, e ile ho mang le hore na e amohetswe. Dikhoutu le mahokela a lekunutu di a patwa.</li>
  <li><strong>Boloka Kopi ya Dintlha</strong> e theolla kopi e phethehileng ya dintlha tsa sekolo sa hao jwalo ka faele ya ZIP: basebedisi, dipholisi, ditokomane, ditlhahlobo, tshebediso le ditlhophiso.</li>
</ul>
<div class="note">
  <span class="lbl">Motho o re ha a ka a fumana imeile?</span>
  <p>Mo batle ho <span class="ui">Di-imeile tse rometsweng</span> pele. Haeba e amohetswe, e fihlile tsamaisong ya hae ya imeile, kahoo mo kope hore a shebe foldara ya junk.</p>
</div>`,
    },
    {
      title: "Di-imeile tseo portal e di romelang",
      html: `
<p class="lede">Tsohle tseo portal e di romelang lebitsong la sekolo.</p>
<div class="tw">
<table>
  <thead><tr><th>Imeile</th><th>E ya ho</th><th>Neng</th></tr></thead>
  <tbody>
    <tr><td>Kamohelo</td><td>Mosebedisi e motjha</td><td>Ha akhaonto ya hae e etswa</td></tr>
    <tr><td>Beha phasewete ya hao</td><td>Mosebedisi</td><td>Ha a sebedisa phasewete e lebetsweng, kapa motsamaisi a romela lehokela</td></tr>
    <tr><td>Tumello e a hlokahala</td><td>Modumedi e mong le e mong ya hlokahalang</td><td>Ha kopo ya ditjhelete e romelwa</td></tr>
    <tr><td>Qeto e ngotswe</td><td>Mokopi</td><td>Ha modumedi e mong le e mong a etsa qeto</td></tr>
    <tr><td>Metsotso ya ho hlahlojwa</td><td>Bohle ba lenaneng la meralo</td><td>Ha moralo o romelwa hore o hlahlojwe</td></tr>
    <tr><td>Diphetoho di kopuwa</td><td>Mongodi</td><td>Ha mohlahlobi a kgutlisa moralo</td></tr>
    <tr><td>Khoutu ya hao ya ho saena</td><td>Mosaeni e mong le e mong</td><td>Ha ho saena ho buleha, kapa khoutu e romelwa hape</td></tr>
    <tr><td>Metsotso e saennweng</td><td>${body}</td><td>Ha tshaeno ya ho qetela e fihla, kapa motho a e romela ka letsoho</td></tr>
    <tr><td>Ketso e abetswe</td><td>Batho ba abetsweng</td><td>Ha ketso e hlahiswa kapa e abelwa motho e mong</td></tr>
    <tr><td>Khopotso ya ketso</td><td>Mang kapa mang eo ketso e mo latelang</td><td>Pele ho letsatsi la ho qetela, ebe e a pheta</td></tr>
    <tr><td>Phaposi e behelletswe kapa e fetotswe</td><td>Motho eo phaposi e mo behelletsweng</td><td>Ha pehelo e etswa, e fetolwa kapa e hlakolwa</td></tr>
    <tr><td>Khopotso ya phaposi</td><td>Motho eo phaposi e mo behelletsweng</td><td>07:00 ka letsatsi la kopano</td></tr>
    <tr><td>Na a ka fumana phaposi?</td><td>Mang kapa mang ya nang le pehelo</td><td>Ha motho a kopa nako ya hae</td></tr>
    <tr><td>Ntlafatso ya beke le beke</td><td>Mosebedisi e mong le e mong wa portal</td><td>Letsatsi le nako eo o e kgethileng</td></tr>
    <tr><td>Kakaretso ya diketso</td><td>Batho le matshwao ao o a kgethileng</td><td>Lenane la nako leo o le kgethileng</td></tr>
  </tbody>
</table>
</div>
<div class="careful">
  <span class="lbl">Dikarabo ha di re fihlele ka tlwaelo</span>
  <p>Imeile ya portal e romelwa ho tswa atereseng e sa amoheleng imeile. Beha <strong>aterese ya ho araba</strong> tlasa <span class="ui">Admin</span>, <span class="ui">Letshwao la Sekolo</span> e le hore karabo e fihle ho motho ho ${school}.</p>
</div>`,
    },
  ],
};
