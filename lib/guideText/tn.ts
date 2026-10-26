import type { GuideText } from "./types";

// Setswana translation of en.ts. Change a chapter in en.ts and change it here
// in the same commit.
export const tn: GuideText = {
  title: "Kaedi ya Potale",
  standfirst:
    "Ka moo o dirisang potale ka teng: kwa dipholisi di bolokilweng teng, ka moo pholisi e lekanngwang le molao ka teng, ka moo madi a kopiwang le go dumelelwa ka teng, ka moo metsotso ya kopano e kwalwang, e tlhatlhobiwang, e saenwang le go fetolwa ditiro ka teng, le ka moo diphaposi di beelwang ka teng. E kwaletswe maloko a lekgotla la taolo, e seng batho ba dikhomputara.",
  chapter: "Kgaolo",
  contents: "Diteng",
  edition: "Kgatiso",
  standard: "Ya Motheo",
  covers: (n) => `E akaretsa dikgaolo di le ${n}`,
  chapters: (school, body) => [
    {
      title: "Go tsena",
      html: `
<p class="lede">Mongwe le mongwe yo o dirisang potale o na le go tsena ga gagwe. Ga go na phasewete e e abelanwang.</p>
<ol class="steps">
  <li>Ya kwa atereseng ya potale ya sekolo sa gago mme o tsene ka aterese ya gago ya imeile.</li>
  <li>Ke lekgetlo la ntlha o le fa, kgotsa o e lebetse? Dirisa <span class="ui">O lebetse phasewete ya gago?</span> mo tsebeng ya go tsena. Kgolagano e tla ka imeile mme e dira mo e ka nnang ura e le nngwe.</li>
  <li>Kgolagano e dira gangwe fela. Fa o sena go baya phasewete e emisa go dira, ka jalo kopa e ntšhwa go na le go dirisa imeile ya kgale gape.</li>
</ol>
<div class="note">
  <span class="lbl">Ga go a tla sepe?</span>
  <p>Simolola ka go leba mo foltareng ya junk. Ditsamaiso tsa imeile tsa dikolo di tlhokomela thata imeile e e tswang kwa atereseng e ba iseng ba e bone. Fa e se teng, kopa motsamaisi go tlhola aterese e e kwadilweng ya gago kwa <span class="ui">Admin</span>, <span class="ui">Badirisi</span>: kgolagano e e romeletsweng kwa atereseng e go se na ope yo o e balang e lebega fela jaaka kgolagano e e iseng e romelwe.</p>
</div>`,
    },
    {
      title: "Go itse tsela",
      html: `
<p class="lede">Lebati la thoko ke potale yotlhe. Se o se bonang se ikaegile ka se o letleletsweng go se dira.</p>
<ul>
  <li><strong>Dashboard</strong> ke kakaretso: ditiro tse di saleng, tiriso ya madi e e emetseng tumelelo, le ditlhatlhobo tsa kobamelo tsa bosheng.</li>
  <li><strong>Batho</strong> ke rejisetara ya ${body}: gore ke mang yo o tshwereng maemo afe gone jaanong.</li>
  <li><strong>Dintlha tsa Tiro</strong> di bontsha gore ke mang yo o dumetseng go dira eng, le gore ke leng.</li>
  <li><strong>Metsotso ya Dikopano</strong> ke fa metsotso e kwalwang, e tlhatlhobiwang le go saenwa teng.</li>
  <li><strong>Kaedi</strong> ke tokomane e.</li>
  <li><strong>Dipholisi</strong>, <strong>Kobamelo</strong> le <strong>Ditokomane</strong> di tshwere ditokomane tsa taolo le ditlhatlhobo tse di di dirilweng.</li>
  <li><strong>Tiriso ya madi</strong> ke dikopo tsa madi, ditlhwatlhwa, ditumelelo le dipego tsa tekanyetsokabo.</li>
  <li><strong>Diphaposi</strong> ke khalendara ya diphaposi tsa dikopano.</li>
  <li><strong>Admin</strong> ke sengwe le sengwe se se bayang gangwe fela: badirisi, diabe, ditshupo, letshwao, di-imeile le dithulaganyo.</li>
</ul>
<p>Fa tsebe e o e solofetseng e seyo, ke kgang ya tetla e seng phoso. Motsamaisi a ka e go naya kwa <span class="ui">Admin</span>, <span class="ui">Diabe</span>.</p>`,
    },
    {
      title: "Go bala potale ka puo ya gago",
      html: `
<p class="lede">Potale e bua dipuo di le supa: Sekgowa, Seburu, Sezulu, Sexhosa, Sepedi, Setswana le Sesotho.</p>
<p>Tlhopha puo ya gago mo lebokosong le le kwa godimo ka fa mojeng wa tsebe nngwe le nngwe, le mo tsebeng ya go tsena. Konopo nngwe le nngwe, leina, molaetsa le kaedi e di fetoga ka bonako, mme potale e gopola tlhopho ya gago mo sedirisweng seo. Se ga se duelelwe.</p>
<h3>Ditokomane tsa sekolo sa gago</h3>
<p>Pholisi kgotsa metsotso di kwadilwe ke sekolo sa gago, ka jalo ga go na thanodi e e di itseng pele. Tseo di ranolwa fa o kopa, mme di duelelwa ka dikhrediti tsa thanolo.</p>
<ul>
  <li>Dikhrediti di ja R100 ka di le 10 mme ga di fele nako. Di reke kwa <span class="ui">Admin</span>, <span class="ui">Dikhrediti tsa Thanolo</span>.</li>
  <li>Khrediti e le nngwe e ranola go fitlha ka ditsebe di le 10 tsa tokomane e le nngwe go ya puong e le nngwe.</li>
  <li>Fa tokomane e sena go ranolwa, mongwe le mongwe mo sekolong sa gago o e bala ka puo eo mahala.</li>
</ul>
<div class="note">
  <span class="lbl">Ke mang yo o ka dirisang dikhrediti</span>
  <p>Ga go ope yo o ka dirisang dikhrediti go fitlha motsamaisi a tshwaya <span class="ui">O ka dirisa dikhrediti tsa thanolo</span> mo mothong yoo kwa <span class="ui">Admin</span>, <span class="ui">Badirisi</span>.</p>
</div>`,
    },
    {
      title: "Batho ba rona",
      html: `
<p class="lede">Ke mang yo o leng mo ${body} ya gago gone jaanong, le gore o mo maemong afe.</p>
<p><span class="ui">Batho</span> e bontsha mongwe le mongwe yo o mo rejisetareng jaaka karata e e nang le maemo a gagwe le aterese ya imeile, mme o ka batla ka leina kgotsa ka maemo. Ke yone karabo ya potso ya "ke mang mmolokamatlotlo wa rona ngwaga ono?"</p>
<ol class="steps">
  <li>E tlhokomele kwa <span class="ui">Admin</span>, <span class="ui">Batho le Maemo</span>. E fetole ka letsatsi le motho a tsenang kgotsa a tswang ka lone.</li>
  <li>Lenaane la maemo, le tatelano e tsebe e balwang ka yone, di baakanngwa kwa <span class="ui">Admin</span>, <span class="ui">Mefuta ya Batho</span>.</li>
</ol>
<div class="note">
  <span class="lbl">Motho ga a tlhoke go tsena mo potaleng</span>
  <p>Motho yo o mo rejisetareng a ka amogela metsotso le dikgopotso ka imeile a sa ka a tsena. Mo neye go tsena fela fa a tlhoka go dirisa potale.</p>
</div>`,
    },
    {
      title: "Dipholisi",
      html: `
<p class="lede">Pholisi nngwe le nngwe ya taolo mo lefelong le le lengwe, le hisitori ya yone yotlhe.</p>
<p>Tsenya pholisi mme potale e e boloka le hisitori ya dikgatiso, ka jalo khopi e ${body} e e dumetseng ka March e santse e le teng morago ga go fetolwa ka September. Ga go sepe se se kwalwang godimo ga se sengwe, ga go sepe se se latlhegang.</p>
<ol class="steps">
  <li><span class="ui">Dipholisi</span>, morago <span class="ui">Tsenya Pholisi</span>.</li>
  <li>E neye leina le motho a ka le batlang, e seng leina la faele, mme o tlhophe karolo.</li>
  <li>Go emisetsa pholisi e e leng teng go oketsa kgatiso e ntšhwa, e seng pholisi ya bobedi.</li>
</ol>
<p>Dikarolo (Ditšhelete, Taolo, Polokesego jalo jalo) ke tsa gago go di fetola kwa <span class="ui">Admin</span>, <span class="ui">Dikarolo tsa Dipholisi</span>.</p>`,
    },
    {
      title: "Go dira tlhatlhobo ya kobamelo",
      html: `
<p class="lede">Tsenya tokomane mme o bone maduo a kobamelo go ya ka molao wa thuto wa Aforika Borwa, le dikgaello di kwadilwe nngwe ka nngwe.</p>
<p>Ditlhatlhobo di dirwa go ya ka <strong>BELA Act</strong>, <strong>SASA</strong> le melawana ya porofense. O bona maduo, mme ka fa tlase ga one dikgaello tse di bonweng: thomelo ya maikarabelo e e sa kwalwang, tshwetso ya ngwaga le ngwaga e e seyong, molao wa maitsholo o o fetileng nako.</p>
<ul>
  <li>Tlhatlhoba pholisi go tswa mo tsebeng ya yone ka <span class="ui">Dira Tlhatlhobo ya Kobamelo</span>, kgotsa tsenya faele nngwe le nngwe kwa <span class="ui">Kobamelo</span>, <span class="ui">Dira Tlhatlhobo</span>.</li>
  <li>Ditokomane tse e seng dipholisi, jaaka konteraka kgotsa leano, di ya kwa <span class="ui">Ditokomane</span> mme di tlhatlhobiwa ka tsela e e tshwanang.</li>
</ul>
<h3>Dikaedi tsa lona</h3>
<p>Kwa <span class="ui">Kobamelo</span>, <span class="ui">Dikaedi</span> o ka tsenya melao e tlhatlhobo e tshwanetseng go e lekanya le yone gape: lekwalo la porofense, kgotsa kwa sekolong se se ikemetseng, melao ya lekgotla la lona. Tlhatlhobo nngwe le nngwe morago ga moo e a di tsaya tsia.</p>
<div class="careful">
  <span class="lbl">Se tlhatlhobo e leng sone le se e seng sone</span>
  <p>E bontsha dikgaello go ya ka molao. Ga e dire gore sekolo se obamele, ebile ga se kgakololo ya molao. Mosola wa yone ke gore motho a ka e dira ka Labobedi motshegare, go na le go bona dikgaello tseo tsa tshwana ka nako ya tlhatlhobo ya dibuka.</p>
</div>
<p>Tlhatlhobo nngwe le nngwe e a bolokwa, ka jalo maduo a ka bapisiwa fa pholisi e sena go fetolwa.</p>`,
    },
    {
      title: "Go kopa madi",
      html: `
<p class="lede">Ka moo porojeke e kopang madi mo ${body} ka teng.</p>
<p>Kopo nngwe le nngwe e tsamaya ka foromo e le nngwe, le fa madi e le a mantsi kgotsa a mannye. Madi a mannye a kwalwa fela go na le go romelwa go dumelelwa, mme a tsena ka kgoro e le nngwe, ka jalo sekolo se nna le rekoto e le nngwe e e feletseng ya se se dirisitsweng le lebaka.</p>
<ul>
  <li><strong>Porojeke le se e leng sa yone.</strong> E kwalele motho yo o neng a se mo kopanong.</li>
  <li><strong>Selekanyo se se fopholetsweng.</strong> Se se swetsa gore kopo e wela mo setlhopheng sefe sa tumelelo.</li>
  <li><strong>Kwa madi a tswang teng.</strong> Kopo e le nngwe e ka kgaoganngwa mo metswedingng e mentsi.</li>
  <li><strong>Ditlhwatlhwa.</strong> Di kopanye mme o kwale gore ke mofepi ofe yo o tlhophilweng.</li>
</ul>`,
    },
    {
      title: "Go dumelela tiriso ya madi",
      html: `
<p class="lede">Gore ke mang yo o tshwanetseng go dumelela kopo go swetswa ke selekanyo sa madi, mme go bewa gangwe fela.</p>
<p>Kwa <span class="ui">Admin</span>, <span class="ui">Dithulaganyo tsa Ditumelelo</span>, ditlhopha tsa selekanyo di tsamaisanngwa le ditlhopha tsa batho. Ka fa tlase ga palo e nngwe kopo e kwalwa fela; fa e feta e nngwe e ya kwa komiting ya ditšhelete. Baya ditlhopha gangwe mme kopo nngwe le nngwe morago ga moo e itsamaya.</p>
<div class="careful">
  <span class="lbl">Badumedi ba a TSIDIWA fa kopo e romelwa</span>
  <p>Mang le mang yo o neng a tlhokega ka nako e kopo e romelwang o nna a tlhokega. Komiti e e bonang leloko le lesha beke e e tlang ga e bule gape kopo e e setseng e swetswe.</p>
</div>
<p>Badumedi ke batho ba ba nang le maina ba ba mo <strong>tshupong</strong>, e seng leina la tiro, ka gonne thata ya go dumelela ke ya motho e seng ya maemo.</p>`,
    },
    {
      title: "Tekanyetsokabo le dipego tsa tiriso ya madi",
      html: `
<p class="lede">Gore ${body} e beetse go le kae ka thoko, ke bokae jo bo solofeditsweng, le gore ke bokae jo bo dirisitsweng.</p>
<p>Kwa <span class="ui">Admin</span>, <span class="ui">Dithulaganyo tsa Tiriso ya Madi</span>, baya ngwaga wa tekanyetsokabo, tekanyetsokabo yotlhe ya CAPEX le kgwedi e ngwaga wa lona wa ditšhelete o felang ka yone. Metswedi ya madi (CAPEX, go kokoanya madi jalo jalo) e kwadilwe fa gape, mme o ka oketsa ya gago.</p>
<p><span class="ui">Tiriso ya madi</span>, <span class="ui">Dipego</span> e bo e bontsha:</p>
<ul>
  <li><strong>Tekanyetsokabo kgatlhanong le tiriso:</strong> tekanyetsokabo, se se solofeditsweng (se se dumetsweng) le se se dirisitsweng tota (se se weditsweng).</li>
  <li><strong>Motswedi mongwe le mongwe wa madi:</strong> se se kopilweng, se se solofeditsweng le se se dirisitsweng.</li>
  <li><strong>Porojeke nngwe le nngwe:</strong> yo o kopileng, madi a le kae, ditlhwatlhwa, mofepi le gore e gorogile kae.</li>
</ul>
<p><span class="ui">Romela kwa ntle jaaka Excel</span> e naya mmolokamatlotlo dipalo tse di tshwanang jaaka spreadsheet.</p>`,
    },
    {
      title: "Go kwala metsotso",
      html: `
<p class="lede">Kwa rekoto ya kopano e kwalwang teng, le se se e dirang tokomane ya sekolo ka bosone.</p>
<p>Bula <span class="ui">Metsotso ya Dikopano</span> mme o tlhophe <span class="ui">Oketsa metsotso</span>. Go na le ditsela di le pedi tsa go tsena mme tsotlhe di fitlha kwa lefelong le le lengwe.</p>
<h3>Go simolola ka sekao</h3>
<p>Sekao ke sebopego sa kopano: dikarolo tse ${body} ya gago e di buisanang ka metlha, ka tatelano, le mafoko a a sa fetogeng a setse a kwadilwe. Lenaane la batho ba ba tlileng ga le fetoge thata, ka jalo le nna mo sekaong mme le a baakanngwa go na le go kwalwa sesha. Dikao di dirwa kwa <span class="ui">Admin</span>, <span class="ui">Admin wa Metsotso</span>.</p>
<ol class="steps">
  <li>Tlhopha <span class="ui">E kwale fa</span> mme o tlhophe sekao.</li>
  <li>Neela metsotso leina, tlhopha kopano, mme o baye paka. Paka e ka nna kgwedi, kotara, kgotsa matlha a o a tlhophang.</li>
  <li>Kwala mo karolong nngwe le nngwe. Karolo nngwe le nngwe e na le setlhogo, se se buisanweng, le gore ke mang yo o nang le maikarabelo.</li>
</ol>
<div class="note">
  <span class="lbl">Goreng dinomoro di simolola fa tlase</span>
  <p>Batho ba ba tlileng le ba ba ikopileng ga se ntlha e e nang le nomoro, ka jalo dinomoro gantsi di simolola kwa karolong ya bobedi kgotsa ya boraro. Yo o dirang sekao o swetsa gore ke karolo efe e leng nomoro 1.</p>
</div>
<h3>Go tsenya metsotso e o setseng o na le yone</h3>
<p>Fa mokwaledi a kwala ka Word, tlhopha <span class="ui">Tsenya faele</span>. Faele e bolokwa jaaka e ntse, mme metsotso e santse e ka tlhatlhobiwa le go saenwa.</p>
<h3>Tokomane ya Word</h3>
<p><span class="ui">Folosa jaaka Word</span> e dira tokomane ya go gatisa kgotsa go e romela go batho. Letshwao la sekolo sa gago le kwa godimo, mme metsotso e latela mo tafoleng e e nang le dinomoro e e lekanang le tsebe.</p>`,
    },
    {
      title: "Go romela thulaganyo go tlhatlhobiwa",
      html: `
<p class="lede">Pele ga ope a saena, thulaganyo e ya kwa bathong ba ba e tlhatlhobang.</p>
<p>Tobetsa <span class="ui">Romela thulaganyo 1 go tlhatlhobiwa</span>. Mongwe le mongwe yo o mo lenaaneng la dithulaganyo la sekolo o romelelwa kgolagano ka imeile, o bula metsotso, mme o a e dumela kgotsa a e busetsa.</p>
<ul>
  <li><strong>Dumela</strong> go raya gore thulaganyo ke rekoto e e siameng ya kopano.</li>
  <li><strong>E busetse</strong> go kopa diphetogo mme go <strong>tlhoka ntlha</strong>. Kwa ntle ga yone mokwaledi o bolelelwa fela gore mongwe ga a kgotsofale.</li>
</ul>
<p>Fa motho a le mongwe a e busetsa, thulaganyo yotlhe e boa ka yone nako eo. Ga go na mosola go kokoanya ditumelelo tse dingwe tsa tokomane e e setseng e kwalwa sesha.</p>
<div class="careful">
  <span class="lbl">Tumelelo ke ya thulaganyo e e e arabileng</span>
  <p>Metsotso e e kwadilweng sesha ke thulaganyo e ntšhwa mme e tlhoka ditumelelo tsa yone. Tse di fetileng di nna mo rekotong jaaka hisitori mme ga di balelwe. Ga go ope yo o tshwanetseng go ya go saena a tshwere ditumelelo tsa kgatiso e go seng ope yo o e badileng.</p>
</div>
<div class="note">
  <span class="lbl">Ga o tlhoke go nna motsamaisi go tlhatlhoba thulaganyo</span>
  <p>Se se swetsang ke go nna mo lenaaneng le thulaganyo e romeletsweng kwa go lone, ga go sepe se sengwe.</p>
</div>`,
    },
    {
      title: "Go saena metsotso",
      html: `
<p class="lede">Go saena go diragala mo tokomaneng ka boyone, fela jaaka mo Adobe kgotsa SignNow.</p>
<p>Mongwe le mongwe yo o saenang o romelelwa ka imeile <strong>khoutu ya gagwe ya ditlhaka di le thataro</strong>. Kgolagano e bula tokomane yotlhe, mme go saena go ka fa tlase ga yone, ka jalo o feta mo go se o dumelang go sone fa o ya teng.</p>
<ol class="steps">
  <li>Bula kgolagano mme o bale metsotso.</li>
  <li>Saena: <strong>thala</strong> ka monwana kgotsa ka mouse, kgotsa <strong>tlanya</strong> leina la gago ka mokwalo wa go saena. Ka tsela epe fela, e tla bonala mo faeleng ya Word.</li>
  <li>Tlanya khoutu e e mo imeileng ya gago mme o netefatse.</li>
</ol>
<div class="careful">
  <span class="lbl">Khoutu ke yone ntlha e kgolo</span>
  <p>E ile kwa atereseng ya gago e seng ya ope o sele, ga e ke e bolokwa ka tsela e ope a ka e balang gape, mme e dirisiwa gangwe fela. O se ka wa e romelela motho gore a go saenele: rekoto e tla re ke wena o saenneng.</p>
</div>
<h3>Tshupetso ya tokomane</h3>
<p>Mosaeno mongwe le mongwe o kwala setshwantsho sa mafoko tota a a saennweng, se se bontshiwang mo metsotsong jaaka tshupetso e khutshwane. Khopi e e dirwang ngwaga o o tlang e ka tlhatlhobiwa kgatlhanong le yone. Fa mosaeno o ka emisa go tsamaisana, potale e bua jalo phatlalatsa go na le go bala sesha ka tidimalo, ka gonne seo ke bosupi jwa gore rekoto e fetogile morago ga go saenwa.</p>
<h3>Go saena mo pampiring</h3>
<p>Folosa faele ya Word, saena ka seatla, mme o tsenye sekene ka <span class="ui">Tsenya khopi e e saenilweng</span>. Seo se tswala metsotso ka tsela e e tshwanang mme se kwala setshwantsho se se tshwanang.</p>
<h3>Go romela metsotso e e saenilweng</h3>
<p>Fa mosaeno wa bofelo o fitlha, metsotso e e saenilweng e ya ka bosone kwa go mongwe le mongwe yo o mo lenaaneng la kabo. Go na le konopo ya <span class="ui">Romela kwa lekgotleng la taolo</span> gape, e e bolelang tota gore e tla fitlha kwa go mang pele o e tobetsa.</p>
<div class="note">
  <span class="lbl">Dirisa konopo fa o saenne mo pampiring</span>
  <p>Metsotso e e tswetsweng ka go tsenya sekene ga e ke e feta mo kgatong ya go saena ka elektroniki, ka jalo ga go sepe se se e romelang ka bosone. Konopo ke yone tsela e e fitlhang ka yone kwa ${body}, le tsela ya go romela gape fa aterese e busitse imeile.</p>
</div>
<div class="careful">
  <span class="lbl">Metsotso e e saenilweng ga e kake ya baakanngwa</span>
  <p>Fa mosaeno mongwe le mongwe o setse o le teng, rekoto e tswetswe. Baakanya sengwe le sengwe mo metsotsong e e latelang. Seo ke sone se se dirang gore mosaeno o nne le mosola.</p>
</div>`,
    },
    {
      title: "Dintlha tsa tiro",
      html: `
<p class="lede">Rejisetara ya gore ke mang yo o dumetseng go dira eng, le gore ke leng.</p>
<p><span class="ui">Dintlha tsa Tiro</span> ke tafole e le nngwe ya sengwe le sengwe se se saleng, le mong wa sone, letlha le gore se gorogile kae. Mongwe le mongwe yo o tsenang a ka e bona, ka gonne motho yo o sa boneng tiro ya gagwe a ka se kgone go e dira.</p>
<h3>Go tsosa tiro go tswa mo metsotsong</h3>
<p>Ke yone tsela ya go e dira. Bula metsotso mme o dirise <span class="ui">Tsosa tiro</span>, kgotsa o tlhophe ntlha e e tswang mo go yone. Setlhogo le mafoko a metsotso di a fetela, ka jalo o baakanya go na le go kwala sesha se kopano e se dumetseng.</p>
<p>Tiro e bo e bontsha gore ke kopano efe e e e dumetseng mme e golagana le yone. Metsotso e kwala tiro nngwe le nngwe e e tswang mo go yone. Ga go lenaane le le ka farologanang le le lengwe.</p>
<div class="note">
  <span class="lbl">Metsotso e e saenilweng ke yone lefelo le le gaisang la go tsosa ditiro</span>
  <p>Go tsosa tiro ga go fetole sepe mo metsotsong, mme rekoto e e saenilweng ke yone e e nang le thata e kgolo go bontsha se se dumetsweng.</p>
</div>
<h3>Go di sala morago</h3>
<p>Potale e romela kgopotso ka imeile palo e e beilweng ya malatsi pele ga letlha la bofelo mme e ka e boeletsa go fitlha tiro e tswalwa. Ke wena o tlhophang gore go gopotswa mang. Ga go ope yo o tshwanetseng go gopola go kgopisa ba bangwe.</p>
<p>Dikarolo tse tiro e ka bewang mo go tsone di baakanngwa kwa <span class="ui">Admin</span>, <span class="ui">Dikarolo tsa Ditiro</span>.</p>`,
    },
    {
      title: "Go beela phaposi ya kopano",
      html: `
<p class="lede">Phaposi ya lekgotla le holo mo khalendareng e le nngwe e e abelanwang, gore dikopano di le pedi di se ka tsa wela mo phaposing e le nngwe.</p>
<ol class="steps">
  <li>Motsamaisi o oketsa diphaposi gangwe fela kwa <span class="ui">Diphaposi</span>, <span class="ui">Diphaposi tsa Dikopano</span>.</li>
  <li>Bula <span class="ui">Diphaposi</span>, <span class="ui">Dipeelo</span>, tlhopha phaposi, mme o tobetse nako e e gololesegileng mo khalendareng ya beke.</li>
  <li>Neela kopano leina le nako. O ka beela mongwe o sele.</li>
</ol>
<ul>
  <li><strong>Dithulano di a thibelwa</strong> pele di diragala: nako e e setseng e tserwe ga e kake ya beelwa gabedi.</li>
  <li><strong>Boeletsa peelo</strong> letsatsi le letsatsi, beke le beke kgotsa kgwedi le kgwedi, go fitlha ka makgetlo a le 52. Fetola kopano e le nngwe mo tatelanong, kgotsa o phimole eno le tsotlhe tse di e latelang. Dikopano tse di fetileng di a bolokwa.</li>
  <li><strong>Dikgopotso</strong> di romelwa ka imeile ka 07:00 ka letsatsi la kopano. Kopano e e pele ga 08:00 e gopotswa mo mosong o o fetileng.</li>
</ul>
<h3>O tlhoka phaposi e mongwe a setseng a na le yone?</h3>
<p>Tobetsa peelo ya gagwe mme o e kope, o neye lebaka. O amogela imeile mme ke ene a swetsang. Ga go sepe se se fetogang fa a sa re ee.</p>
<div class="note">
  <span class="lbl">Ga o bone Diphaposi?</span>
  <p>Go beela le go tsamaisa diphaposi ke ditetla. Motsamaisi o di tshwaya kwa <span class="ui">Admin</span>, <span class="ui">Diabe</span>.</p>
</div>`,
    },
    {
      title: "Go itsise mongwe le mongwe",
      html: `
<p class="lede">Di-imeile di le pedi tse di go gopotsang batho.</p>
<h3>Tlhabololo ya beke le beke</h3>
<p>Kwa <span class="ui">Admin</span>, <span class="ui">Tlhabololo ya Beke le Beke</span>: imeile e le nngwe ka beke kwa modirising mongwe le mongwe wa potale, e na le dintlha tsa tiro tse di bulegileng, tiriso ya madi e e emetseng tumelelo, ba ba iseng ba tsene, le metsotso e e santseng e emetse mesaeno. Tlhopha letsatsi le nako, tshwaya <span class="ui">Romela tlhabololo ya beke le beke ka tsosi</span> mme o boloke. Ga go sepe se se romelwang go fitlha o dira jalo.</p>
<h3>Kakaretso ya dintlha tsa tiro</h3>
<p>Kwa <span class="ui">Admin</span>, <span class="ui">Imeile ya Kakaretso ya Ditiro</span>: rejisetara yotlhe e e bulegileng jaaka buka ya Excel, ka thulaganyo ya nako e o e tlhophang, kwa bathong le ditshupong tse o di tlhophang. Tshupo e batlwa sesha nako nngwe le nngwe fa e romelwa, ka jalo motho yo o newang tshupo kgwedi e e tlang o tla bo a le mo go e e latelang.</p>
<div class="note">
  <span class="lbl">E leke mo go wena pele</span>
  <p>Ditsebe tsotlhe di le pedi di go letla go iromelela sekao ka imeile pele ga sepe se ya kwa ${body} yotlhe.</p>
</div>`,
    },
    {
      title: "Batho, badirisi le ditshupo",
      html: `
<p class="lede">Dilo di le tharo tse di farologanang tse go leng motlhofo go di tlhakatlhakanya.</p>
<ul>
  <li><strong>Motho</strong> o mo rejisetareng ya ${body}. O tshwere maemo mme o na le aterese ya imeile. A ka nna a se nne le go tsena gope.</li>
  <li><strong>Modirisi</strong> a ka tsena mo potaleng. Se a ka se dirang se bewa ke <strong>seabe</strong> sa gagwe, kwa <span class="ui">Admin</span>, <span class="ui">Diabe</span>.</li>
  <li><strong>Tshupo</strong> e neela setlhopha sa batho leina, mme ke yone e e swetsang gore ke mang yo o dumelelang tiriso ya madi le gore ke mang yo o amogelang metsotso efe.</li>
</ul>
<p>Tshupo e ka nna mo mothong kgotsa mo modirising, ka jalo motho yo o sa tseneng a santse a ka amogela metsotso. Ditshupo di bewa kwa <span class="ui">Admin</span>, <span class="ui">Ditshupo</span>, mme di tsenngwa go tswa kwa <span class="ui">Admin</span>, <span class="ui">Batho le Maemo</span> kgotsa <span class="ui">Badirisi</span>.</p>
<div class="careful">
  <span class="lbl">Baya ditshupo tsa metsotso pele ga kopano ya ntlha</span>
  <p>Kwa <span class="ui">Admin</span>, <span class="ui">Admin wa Metsotso</span>, bolela gore ke tshupo efe e e tlhatlhobang thulaganyo, efe e e saenang, le gore ke mang yo o amogelang metsotso e e saenilweng. Go romela thulaganyo kgotsa go bula go saena go tla gana go fitlha tseo di le teng, mme go tla bolela thulaganyo e e tshwanetseng go baakanngwa go na le go romela lefeela.</p>
</div>`,
    },
    {
      title: "Go dira gore e lebege jaaka sekolo sa gago",
      html: `
<p class="lede">Letshwao la gago le mebala ya gago.</p>
<p>Kwa <span class="ui">Admin</span>, <span class="ui">Letshwao la Sekolo</span>:</p>
<ul>
  <li><strong>Letshwao la gago</strong>, le le bonalang mo tsebeng ya go tsena, mo lebating la thoko, mo imeileng nngwe le nngwe e potale e e romelang le kwa godimo ga metsotso ya gago ya Word.</li>
  <li><strong>Mebala e mebedi</strong>, o mogolo le o o tlaleletsang. Sengwe le sengwe se sele se dirwa go tswa mo go one, go akaretsa go netefatsa gore mafoko a nna a balega mo mmalang wa gago o mogolo.</li>
  <li><strong>Aterese ya karabo</strong>, gore motho yo o arabang imeile ya potale a fitlhe kwa lebokosong la imeile le motho a le balang.</li>
</ul>
<div class="note">
  <span class="lbl">Go fitlha o tsenya letshwao</span>
  <p>Potale e bontsha letshwao le le motlhofo go na le go akanya. Ga e kitla e bontsha letshwao la sekolo se sengwe.</p>
</div>`,
    },
    {
      title: "Go boloka rekoto",
      html: `
<p class="lede">Se se diragetseng, se se rometsweng, le khopi ya sengwe le sengwe.</p>
<ul>
  <li><strong>Rekoto ya Ditiragalo</strong> e kwala tiro nngwe le nngwe e e dirilweng mo potaleng, yo o e dirileng le nako, go akaretsa go tsena. Ke yone rekoto e motlhatlhobi wa dibuka a e kopang.</li>
  <li><strong>Di-imeile tse di rometsweng</strong> e kwala imeile nngwe le nngwe e potale e e rometseng, gore e ile kwa go mang le gore a e amogetswe. Dikhoutu le dikgolagano tsa poraefete di a fitlhwa.</li>
  <li><strong>Boloka Khopi ya Data</strong> e folosa khopi e e feletseng ya data ya sekolo sa gago jaaka faele ya ZIP: badirisi, dipholisi, ditokomane, ditlhatlhobo, tiriso ya madi le dithulaganyo.</li>
</ul>
<div class="note">
  <span class="lbl">Mongwe a re ga a ise a amogele imeile?</span>
  <p>Mo batle pele mo <span class="ui">Di-imeile tse di rometsweng</span>. Fa e amogetswe, e fitlhile kwa tsamaisong ya gagwe ya imeile, ka jalo mo kope go leba mo foltareng ya junk.</p>
</div>`,
    },
    {
      title: "Di-imeile tse potale e di romelang",
      html: `
<p class="lede">Sengwe le sengwe se potale e se romelang mo boemong jwa sekolo.</p>
<div class="tw">
<table>
  <thead><tr><th>Imeile</th><th>E ya kwa go</th><th>Leng</th></tr></thead>
  <tbody>
    <tr><td>O amogelesegile</td><td>Modirisi yo mosha</td><td>Akhaonto ya gagwe e dirwa</td></tr>
    <tr><td>Baya phasewete ya gago</td><td>Modirisi</td><td>O dirisa O lebetse phasewete ya gago?, kgotsa motsamaisi o romela kgolagano</td></tr>
    <tr><td>Go tlhokega tumelelo</td><td>Modumedi mongwe le mongwe yo o tlhokegang</td><td>Kopo ya madi e romelwa</td></tr>
    <tr><td>Tshwetso e kwadilwe</td><td>Mokopi</td><td>Modumedi mongwe le mongwe o a swetsa</td></tr>
    <tr><td>Metsotso ya go tlhatlhoba</td><td>Mongwe le mongwe mo lenaaneng la dithulaganyo</td><td>Thulaganyo e romelwa go tlhatlhobiwa</td></tr>
    <tr><td>Go kopilwe diphetogo</td><td>Mokwaledi</td><td>Motlhatlhobi o busetsa thulaganyo</td></tr>
    <tr><td>Khoutu ya gago ya go saena</td><td>Mosaeni mongwe le mongwe</td><td>Go saena go a bulwa, kgotsa khoutu e romelwa gape</td></tr>
    <tr><td>Metsotso e e saenilweng</td><td>${body}</td><td>Mosaeno wa bofelo o fitlha, kgotsa mongwe o e romela ka seatla</td></tr>
    <tr><td>Tiro e abetswe</td><td>Batho ba ba abetsweng</td><td>Tiro e a tsosiwa kgotsa e abelwa gape</td></tr>
    <tr><td>Kgopotso ya tiro</td><td>Mang le mang yo tiro e mo gopotsang</td><td>Pele ga letlha la bofelo, morago e a boelediwa</td></tr>
    <tr><td>Phaposi e beetswe kgotsa e fetotswe</td><td>Motho yo phaposi e mo beetsweng</td><td>Peelo e a dirwa, e a fetolwa kgotsa e a phimolwa</td></tr>
    <tr><td>Kgopotso ya phaposi</td><td>Motho yo phaposi e mo beetsweng</td><td>07:00 ka letsatsi la kopano</td></tr>
    <tr><td>A ba ka nna le phaposi?</td><td>Mang le mang yo o nang le peelo</td><td>Mongwe o kopa nako ya gagwe</td></tr>
    <tr><td>Tlhabololo ya beke le beke</td><td>Modirisi mongwe le mongwe wa potale</td><td>Letsatsi le nako e o e tlhophileng</td></tr>
    <tr><td>Kakaretso ya dintlha tsa tiro</td><td>Batho le ditshupo tse o di tlhophileng</td><td>Thulaganyo ya nako e o e tlhophileng</td></tr>
  </tbody>
</table>
</div>
<div class="careful">
  <span class="lbl">Dikarabo ga di re fitlhele ka tlwaelo</span>
  <p>Imeile ya potale e romelwa go tswa kwa atereseng e e sa amogeleng imeile. Baya <strong>aterese ya karabo</strong> kwa <span class="ui">Admin</span>, <span class="ui">Letshwao la Sekolo</span> gore karabo e fitlhe kwa mothong mongwe kwa ${school}.</p>
</div>`,
    },
  ],
};
