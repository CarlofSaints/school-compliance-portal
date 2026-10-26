import type { GuideText } from "./types";

// Sepedi (Sesotho sa Leboa) translation of en.ts. Keep chapters, tags and
// class names in step with en.ts.
export const nso: GuideText = {
  title: "Tlhahlo ya Phothale",
  standfirst:
    "Ka moo o ka šomišago phothale ka gona: moo melaotshepetšo e bolokilwego, ka moo molaotshepetšo o hlahlobjago go bapetšwa le molao, ka moo tšhelete e kgopelwago le go dumelelwa, ka moo metsotso ya kopano e ngwalwago, e hlahlobjago, e saennwago le go fetošwa mešomo, le ka moo diphapoši di pukwago ka gona. E ngwaletšwe maloko a lekgotla, e sego batho ba dikhomphutha.",
  chapter: "Kgaolo",
  contents: "Diteng",
  edition: "Kgatišo",
  standard: "Ya Tlwaelo",
  covers: (n) => `E akaretša dikgaolo tše ${n}`,
  chapters: (school, body) => [
    {
      title: "Go tsena",
      html: `
<p class="lede">Mang le mang yo a šomišago phothale o na le go tsena ga gagwe. Ga go na lentšu la sephiri leo le abelanwago.</p>
<ol class="steps">
  <li>Eya atereseng ya phothale ya sekolo sa gago gomme o tsene ka aterese ya gago ya imeile.</li>
  <li>Ke la mathomo o le mo, goba o le lebetše? Šomiša <span class="ui">O lebetše lentšu la sephiri</span> letlakaleng la go tsena. Kgokagano e tla ka imeile gomme e šoma nako ya go ka ba iri.</li>
  <li>Kgokagano e šoma gatee fela. Ge o beile lentšu la sephiri e tlogela go šoma, ka fao kgopela ye mpsha go e na le go šomiša imeile ya kgale gape.</li>
</ol>
<div class="note">
  <span class="lbl">Ga go selo seo se fihlilego?</span>
  <p>Pele, lebelela foldareng ya ditšhila (junk). Mananeo a imeile a dikolo a hlokomela kudu imeile ye e tšwago atereseng yeo a sa e tsebego. Ge e se gona, kgopela molaodi go lebelela aterese yeo e bolokilwego ka fase ga <span class="ui">Taolo</span>, <span class="ui">Bašomiši</span>: kgokagano ye e rometšwego atereseng yeo go se nago yo a e balago e swana tamo le kgokagano yeo e sego ya ka ya romelwa.</p>
</div>`,
    },
    {
      title: "Go hwetša tsela ya gago",
      html: `
<p class="lede">Lenaneo la ka thoko ke phothale ka moka. Seo o se bonago se ithekgile ka seo o dumeletšwego go se dira.</p>
<ul>
  <li><strong>Kakaretšo</strong> ke kakaretšo: mešomo ye e sa dirwago, tšhelete ye e letetšego tumelelo, ditlhahlobo tša kobamelo tša morago bjale.</li>
  <li><strong>Batho</strong> ke rekhoto ya ${body}: ke mang yo a swerego maemo afe bjale.</li>
  <li><strong>Mešomo ya go Dirwa</strong> ke mang yo a dumetšego go dira eng, le neng.</li>
  <li><strong>Metsotso ya Kopano</strong> ke moo metsotso e ngwalwago, e hlahlobjago le go saennwa.</li>
  <li><strong>Tlhahlo</strong> ke tokumente ye.</li>
  <li><strong>Melaotshepetšo</strong>, <strong>Kobamelo</strong> le <strong>Ditokumente</strong> di swara ditokumente tša taolo le ditlhahlobo tšeo di dirilwego go tšona.</li>
  <li><strong>Tšhomišo</strong> ke dikgopelo tša tšhelete, ditheko, ditumelelo le dipego tša tekanyetšo.</li>
  <li><strong>Diphapoši</strong> ke khalendara ya diphapoši tša dikopano.</li>
  <li><strong>Taolo</strong> ke dilo ka moka tšeo di beakanywago gatee: bašomiši, dikarolo, maswao, leswao la sekolo, diimeile le dipeakanyo.</li>
</ul>
<p>Ge letlakala leo o le letetšego le se gona, ke taba ya tumelelo, e sego phošo. Molaodi a ka go e fa ka fase ga <span class="ui">Taolo</span>, <span class="ui">Dikarolo</span>.</p>`,
    },
    {
      title: "Go bala phothale ka polelo ya gago",
      html: `
<p class="lede">Phothale e bolela maleme a šupago: Seisemane, Seafrikanse, Sezulu, Sexhosa, Sepedi, Setswana le Sesotho.</p>
<p>Kgetha polelo ya gago lepokising le le lego godimo ka go le letona la letlakala le lengwe le le lengwe, le letlakala la go tsena. Konopo ye nngwe le ye nngwe, leswao, molaetša le tlhahlo ye di fetoga gona bjale, gomme phothale e gopola kgetho ya gago sedirišweng seo. Se ga se bitše selo.</p>
<h3>Ditokumente tša sekolo sa gago</h3>
<p>Molaotshepetšo goba metsotso di ngwadilwe ke sekolo sa gago, ka fao ga go pukuntšu yeo e di tsebago e sa le pele. Tšona di fetolelwa ge di kgopelwa, gomme di lefelelwa ka dikhrediti tša phetolelo.</p>
<ul>
  <li>Dikhrediti di bitša R100 bakeng sa tše 10 gomme ga di fele nako. Di odere ka fase ga <span class="ui">Taolo</span>, <span class="ui">Dikhrediti tša Phetolelo</span>.</li>
  <li>Khrediti e tee e fetolela matlakala a go fihla go a 10 a tokumente e tee go polelo e tee.</li>
  <li>Ge tokumente e fetoletšwe, mang le mang sekolong sa gago o e bala ka polelo yeo mahala.</li>
</ul>
<div class="note">
  <span class="lbl">Ke mang yo a ka šomišago dikhrediti</span>
  <p>Ga go yo a ka šomišago dikhrediti go fihlela molaodi a swaya <span class="ui">A ka šomiša dikhrediti tša phetolelo</span> go motho yoo ka fase ga <span class="ui">Taolo</span>, <span class="ui">Bašomiši</span>.</p>
</div>`,
    },
    {
      title: "Batho ba Rena",
      html: `
<p class="lede">Ke mang yo a dutšego go ${body} ya gago bjale, le maemong afe.</p>
<p><span class="ui">Batho</span> e bontšha mang le mang yo a lego rekhotong bjalo ka karata ye e nago le maemo a gagwe le aterese ya imeile, gomme o ka nyaka ka leina goba ka maemo. Ke karabo ya potšišo ye: "mmolokatšhelete wa rena ngwaga wo ke mang?"</p>
<ol class="steps">
  <li>E boloke e le ya bjale ka fase ga <span class="ui">Taolo</span>, <span class="ui">Batho le Maemo</span>. E mpshafatše ka letšatši leo motho a tsenago goba a tlogago.</li>
  <li>Lenaneo la maemo, le tatelano yeo letlakala le balwago ka yona, di beakanywa ka fase ga <span class="ui">Taolo</span>, <span class="ui">Mehuta ya Batho</span>.</li>
</ol>
<div class="note">
  <span class="lbl">Motho ga a hloke go tsena</span>
  <p>Motho yo a lego rekhotong a ka amogela metsotso le dikgopotšo ka imeile ntle le go tsena le gatee. Mo fe go tsena fela ge a swanetše go šomiša phothale.</p>
</div>`,
    },
    {
      title: "Melaotshepetšo",
      html: `
<p class="lede">Molaotshepetšo o mongwe le o mongwe wa taolo lefelong le tee, le histori ya wona ka moka.</p>
<p>Laiša molaotshepetšo gomme phothale e o boloka le histori ya dikgatišo, ka fao kopi yeo ${body} e e dumeletšego ka March e sa le gona le ge e fetotšwe ka September. Ga go selo seo se ngwalwago godimo ga se sengwe, gomme ga go selo seo se lahlegago.</p>
<ol class="steps">
  <li><span class="ui">Melaotshepetšo</span>, ke moka <span class="ui">Laiša Molaotshepetšo</span>.</li>
  <li>O fe leina leo motho a ka le nyakago, e sego leina la faele, gomme o kgethe sehlopha.</li>
  <li>Go tšeela molaotshepetšo wo o lego gona legato go oketša kgatišo, e sego molaotshepetšo wa bobedi.</li>
</ol>
<p>Dihlopha (Ditšhelete, Taolo, Polokego le tše dingwe) ke tša gago go di fetoša ka fase ga <span class="ui">Taolo</span>, <span class="ui">Dihlopha tša Melaotshepetšo</span>.</p>`,
    },
    {
      title: "Go dira tlhahlobo ya kobamelo",
      html: `
<p class="lede">Laiša tokumente gomme o hwetše dintlha tša kobamelo go bapetšwa le molao wa thuto wa Afrika Borwa, le dikgaello di ngwadilwe ka o tee ka o tee.</p>
<p>Ditlhahlobo di dirwa go bapetšwa le <strong>BELA Act</strong>, <strong>SASA</strong> le melawana ya profense. O hwetša dintlha, gomme ka fase ga tšona go na le dikgaello tšeo di hweditšwego: kabelo ya maatla yeo e sa ngwalwago, sephetho sa ngwaga ka ngwaga seo se sego gona, molao wa maitshwaro wo o fetilwego ke nako.</p>
<ul>
  <li>Hlahloba molaotshepetšo thwii letlakaleng la wona ka <span class="ui">Dira Tlhahlobo ya Kobamelo</span>, goba o laiše faele efe goba efe ka fase ga <span class="ui">Kobamelo</span>, <span class="ui">Dira Tlhahlobo</span>.</li>
  <li>Ditokumente tšeo e sego melaotshepetšo, bjalo ka konteraka goba leano, di ya ka fase ga <span class="ui">Ditokumente</span> gomme di hlahlobjwa ka tsela yeo e swanago.</li>
</ul>
<h3>Ditlhahlo tša lena</h3>
<p>Ka fase ga <span class="ui">Kobamelo</span>, <span class="ui">Ditlhahlo</span> o ka laiša melao yeo tlhahlobo e swanetšego go bapetša le yona gape: lengwalo la profense, goba bakeng sa sekolo sa poraebete, melao ya boto ya lena. Tlhahlobo ye nngwe le ye nngwe ka morago ga moo e a e ela hloko.</p>
<div class="careful">
  <span class="lbl">Seo tlhahlobo e lego sona le seo e sego sona</span>
  <p>E bontšha dikgaello go bapetšwa le molao. Ga e dire gore sekolo se kobamele, gomme ga se keletšo ya molao. Mohola wa yona ke gore motho a ka e dira ka Labobedi thapama go e na le go hwetša dikgaello tšona tšeo nakong ya hlahlobo ya dipuku.</p>
</div>
<p>Tlhahlobo ye nngwe le ye nngwe e a bolokwa, ka fao dintlha di ka bapetšwa ka morago ga ge molaotshepetšo o fetotšwe.</p>`,
    },
    {
      title: "Go kgopela tšhelete",
      html: `
<p class="lede">Ka moo projeke e kgopelago ${body} tšhelete ka gona.</p>
<p>Kgopelo ye nngwe le ye nngwe e feta ka foromo ye e swanago go sa šetšwe palo ya tšhelete. Ditšhelete tše nnyane di a ngwalwa fela go e na le go romelwa go dumelelwa, eupša di feta ka lebati le le swanago, ka fao sekolo se felela se na le rekhoto e tee ye e feletšego ya seo se šomišitšwego le lebaka.</p>
<ul>
  <li><strong>Projeke le seo e lego sa sona.</strong> E ngwalele motho yo a bego a se gona kopanong.</li>
  <li><strong>Palo ye e akanywago.</strong> Ye e laola gore e wela ka legatong lefe la tumelelo.</li>
  <li><strong>Moo tšhelete e tšwago gona.</strong> Kgopelo e tee e ka arolwa go methopo ye mentši.</li>
  <li><strong>Ditheko.</strong> Di kgomaretše gomme o ngwale gore ke mofepi ofe yo a kgethilwego.</li>
</ul>`,
    },
    {
      title: "Go dumelela tšhomišo",
      html: `
<p class="lede">Gore ke mang yo a swanetšego go dumelela kgopelo go laolwa ke palo ya tšhelete, gomme go beakanywa gatee.</p>
<p>Ka fase ga <span class="ui">Taolo</span>, <span class="ui">Dipeakanyo tša Ditumelelo</span>, magato a ditšhelete a bapetšwa le dihlopha tša batho. Ka fase ga palo ye nngwe kgopelo e a ngwalwa fela; ka godimo ga ye nngwe e ya go komiti ya ditšhelete. Beakanya magato gatee gomme kgopelo ye nngwe le ye nngwe ka morago ga moo e ikiša moo e swanetšego.</p>
<div class="careful">
  <span class="lbl">Badumelledi ba a TIIŠWA ge kgopelo e romelwa</span>
  <p>Yo a bego a nyakega ka nako yeo e romelwago o dula a nyakega. Komiti ye e hwetšago leloko le leswa beke ye e tlago ga e bule gape kgopelo yeo e šetšego e tšerwe sephetho.</p>
</div>
<p>Badumelledi ke batho ba maina bao ba swerego <strong>leswao</strong>, e sego leina la mošomo, ka gobane maatla a go dumelela ke a motho, e sego a karolo.</p>`,
    },
    {
      title: "Tekanyetšo le dipego tša tšhomišo",
      html: `
<p class="lede">Gore ${body} e beetše thoko bokae, go holofeditšwe bokae, le go šomišitšwe bokae.</p>
<p>Ka fase ga <span class="ui">Taolo</span>, <span class="ui">Dipeakanyo tša Tšhomišo</span>, beakanya ngwaga wa tekanyetšo, tekanyetšo ka moka ya CAPEX le kgwedi yeo ngwaga wa lena wa ditšhelete o felago ka yona. Methopo ya tšhelete (CAPEX, go kgoboketša tšhelete le tše dingwe) e ngwadilwe moo le yona, gomme o ka oketša ya gago.</p>
<p><span class="ui">Tšhomišo</span>, <span class="ui">Dipego</span> ke moka e bontšha:</p>
<ul>
  <li><strong>Tekanyetšo go bapetšwa le tšhomišo:</strong> tekanyetšo, seo se holofeditšwego (se dumeletšwe) le seo se šomišitšwego ka nnete (se feditšwe).</li>
  <li><strong>Mothopo o mongwe le o mongwe wa tšhelete:</strong> se kgopetšwego, se holofeditšwego le se šomišitšwego.</li>
  <li><strong>Projeke ye nngwe le ye nngwe:</strong> ke mang yo a kgopetšego, bokae, ditheko, mofepi le gore e fihlile kae.</li>
</ul>
<p><span class="ui">Romela ka ntle go Excel</span> e fa mmolokatšhelete dipalo tšona tšeo bjalo ka letlakala la dipalo (spreadsheet).</p>`,
    },
    {
      title: "Go ngwala metsotso",
      html: `
<p class="lede">Moo rekhoto ya kopano e ngwalwago gona, le seo se e dirago tokumente ya sekolo ka bosona.</p>
<p>Bula <span class="ui">Metsotso ya Kopano</span> gomme o kgethe <span class="ui">Oketša metsotso</span>. Go na le ditsela tše pedi tša go tsena gomme ka bobedi di felela lefelong le tee.</p>
<h3>Go thoma ka sebopego</h3>
<p>Sebopego ke sebopego sa kopano: dikarolo tšeo ${body} ya lena e di akaretšago ka mehla, ka tatelano, le mantšu a tlwaelo a šetše a tladitšwe. Lenaneo la batho bao ba bego ba le gona ga le fetoge kudu, ka fao le dula go sebopego gomme le a lokišwa go e na le go thaipiwa gape. Dibopego di agwa ka fase ga <span class="ui">Taolo</span>, <span class="ui">Taolo ya Metsotso</span>.</p>
<ol class="steps">
  <li>Kgetha <span class="ui">Di ngwale mo</span> gomme o kgethe sebopego.</li>
  <li>Fa metsotso leina, kgetha kopano, gomme o beakanye nako. Nako e ka ba kgwedi, kotara, goba matšatši ao o a kgethago.</li>
  <li>Thaipa karolong ye nngwe le ye nngwe. Karolo ye nngwe le ye nngwe e na le hlogo, seo se boletšwego, le gore ke mang yo a ikarabelago.</li>
</ol>
<div class="note">
  <span class="lbl">Lebaka leo dinomoro di thomago fase kua</span>
  <p>Batho bao ba bego ba le gona le bao ba kgopetšego tshwarelo ga se ntlha ye e nago le nomoro, ka fao dinomoro gantši di thoma karolong ya bobedi goba ya boraro. Yo a beakanyago sebopego o kgetha gore ke karolo efe ye e lego nomoro 1.</p>
</div>
<h3>Go laiša metsotso yeo o šetšego o na le yona</h3>
<p>Ge mongwaledi a ngwala ka Word, kgetha <span class="ui">Laiša faele</span>. Faele e bolokwa ka mo e lego ka gona, gomme metsotso e sa kgona go hlahlobja le go saennwa.</p>
<h3>Tokumente ya Word</h3>
<p><span class="ui">Theolla bjalo ka Word</span> e dira tokumente ya go gatišwa goba go abelanwa. Leswao la sekolo sa gago le dula godimo, gomme metsotso e latela ka tafoleng ye e nago le dinomoro yeo e lekanago le letlakala.</p>`,
    },
    {
      title: "Go romela kakanyo gore e hlahlobjwe",
      html: `
<p class="lede">Pele motho a saena, kakanyo e ya go batho bao ba e hlahlobago.</p>
<p>Tobetša <span class="ui">Romela tokumente ya 1 go lekolwa</span>. Mang le mang yo a lego lenaneong la dikakanyo la sekolo o romelwa kgokagano ka imeile, o bula metsotso, gomme o e amogela goba o e bušetša morago.</p>
<ul>
  <li><strong>Amogela</strong> e re kakanyo ke rekhoto ya maleba ya kopano.</li>
  <li><strong>Bušetša morago</strong> e kgopela diphetogo gomme <strong>e nyaka ntlha ye e ngwadilwego</strong>. Ntle le yona mongwaledi o botšwa fela gore motho ga a kgotsofale.</li>
</ul>
<p>Motho o tee yo a e bušetšago morago o bušetša kakanyo ka moka gatee. Ga go na mohola wa go kgoboketša ditumelelo tše dingwe bakeng sa tokumente yeo e šetšego e ngwalwa leswa.</p>
<div class="careful">
  <span class="lbl">Tumelelo ke ya kakanyo yeo e e arabilego</span>
  <p>Metsotso yeo e ngwadilwego leswa ke kakanyo ye mpsha gomme e nyaka ditumelelo tša yona. Tša pele di dula rekhotong bjalo ka histori eupša ga di balwe. Ga go yo a swanetšego go tla go saena a swere ditumelelo tša kgatišo yeo go se nago yo a e badilego.</p>
</div>
<div class="note">
  <span class="lbl">Ga o hloke go ba molaodi go hlahloba kakanyo</span>
  <p>Seo se e laolago ke go ba lenaneong leo kakanyo e romeletšwego go lona, ga go se sengwe.</p>
</div>`,
    },
    {
      title: "Go saena metsotso",
      html: `
<p class="lede">Go saena go direga tokumenteng ka boyona, ka mo go dirwago ka gona go Adobe goba SignNow.</p>
<p>Mang le mang yo a saenago o romelwa <strong>khoutu ya gagwe ya ditlhaka tše tshela</strong> ka imeile. Kgokagano e bula tokumente ka moka, gomme go saena go ka fase ga yona, ka fao o phetla o feta seo o se dumelago ge o le tseleng go ya moo.</p>
<ol class="steps">
  <li>Bula kgokagano gomme o bale metsotso.</li>
  <li>Saena: <strong>thala</strong> ka monwana goba ka mouse, goba <strong>thaipa</strong> leina la gago ka mongwalo wa mosaeno. Ka tsela efe goba efe o tla bonagala faeleng ya Word.</li>
  <li>Thaipa khoutu go tšwa imeileng ya gago gomme o netefatše.</li>
</ol>
<div class="careful">
  <span class="lbl">Khoutu ke yona taba</span>
  <p>E ile atereseng ya gago e sego ya motho e mongwe, ga e bolokwe ka sebopego seo motho a ka se balago gape, gomme e šomišwa gatee. O se e romele go motho gore a saene legatong la gago: rekhoto e tla re ke wena o saennego.</p>
</div>
<h3>Tšhupetšo ya tokumente</h3>
<p>Mosaeno o mongwe le o mongwe o ngwala monwana (fingerprint) wa mantšu tamo ao a saennwego, gomme o bontšhwa metsotsong bjalo ka tšhupetšo ye kopana. Kopi ye e dirwago ngwaga wo o tlago e ka hlahlobja go bapetšwa le yona. Ge mosaeno o ka se sa swana, phothale e bolela seo ka go hlaka go e na le go bala gape ka sephiring, ka gobane seo ke bohlatse bja gore rekhoto e fetogile ka morago ga go saena.</p>
<h3>Go saena pampiring</h3>
<p>Theolla faele ya Word, saena ka seatla, gomme o laiše kopi ye e skenilwego ka <span class="ui">Laiša kopi ye e saennwego</span>. Seo se tswalela metsotso ka tsela ye e swanago gomme se ngwala monwana wona woo.</p>
<h3>Go romela metsotso ye e saennwego</h3>
<p>Ge mosaeno wa mafelelo o fihla, metsotso ye e saennwego e ya go mang le mang yo a lego lenaneong la kabo ka boyona. Go na le konopo ya <span class="ui">Romela go lekgotla-taolo</span> gape, yeo e bolelago tamo gore e tla fihla go mang pele o e tobetša.</p>
<div class="note">
  <span class="lbl">Šomiša konopo ge o saennwe pampiring</span>
  <p>Metsotso yeo e tswaletšwego ka go laiša kopi ye e skenilwego ga e fete legatong la go saena ka elektroniki, ka fao ga go selo seo se e romelago ka boyona. Konopo ke tsela yeo e fihlago go ${body} ka yona, le tsela ya go romela gape ge aterese e bušitšwe.</p>
</div>
<div class="careful">
  <span class="lbl">Metsotso ye e saennwego e ka se fetošwe</span>
  <p>Ge mesaeno ka moka e le gona, rekhoto e a tswalelwa. Lokiša selo le ge e le sefe metsotsong ye e latelago. Seo ke sona se dirago gore mosaeno o be le mohola.</p>
</div>`,
    },
    {
      title: "Mešomo ya go dirwa",
      html: `
<p class="lede">Rekhoto ya gore ke mang yo a dumetšego go dira eng, le neng.</p>
<p><span class="ui">Mešomo ya go Dirwa</span> ke tafola e tee ya dilo ka moka tšeo di sa dirwago, le mong wa tšona, letšatši le gore di fihlile kae. Mang le mang yo a tsenago a ka e bona, ka gobane motho yo a sa bonego mošomo wa gagwe a ka se kgone go o dira.</p>
<h3>Go tšweletša mošomo go tšwa metsotsong</h3>
<p>Ye ke tsela ya go e dira. Bula metsotso gomme o šomiše <span class="ui">Tšweletša mošomo</span>, goba o kgethe ntlha yeo o tšwago go yona. Hlogo le mantšu a metsotso di a fetišetšwa, ka fao o lokiša go e na le go thaipa gape seo kopano e se dumetšego.</p>
<p>Mošomo o bontšha gore ke kopano efe yeo e o dumetšego gomme o kgokaganya morago go yona. Metsotso e ngwala mošomo o mongwe le o mongwe wo o tšwilego go yona. Ga go lenaneo le le ka arogago le le lengwe.</p>
<div class="note">
  <span class="lbl">Metsotso ye e saennwego ke lefelo le kaone la go tšweletša mešomo</span>
  <p>Go tšweletša mošomo ga go fetoše selo metsotsong, gomme rekhoto ye e saennwego ke yona e tiilego kudu ya seo se dumetšwego.</p>
</div>
<h3>Go ba gopotša</h3>
<p>Phothale e romela kgopotšo ka imeile palo ye e beilwego ya matšatši pele ga letšatši la mafelelo gomme e ka e boeletša go fihlela mošomo o tswalelwa. Ke wena o kgethago gore ke mang yo a gopotšwago. Ga go yo a swanetšego go gopola go tshwenya.</p>
<p>Dihlopha tšeo mošomo o ka bolokwago ka tšona di beakanywa ka fase ga <span class="ui">Taolo</span>, <span class="ui">Dihlopha tša Mešomo</span>.</p>`,
    },
    {
      title: "Go puka phapoši ya dikopano",
      html: `
<p class="lede">Phapoši ya boto le holo khalendareng e tee ye e abelanwago, ka fao dikopano tše pedi di ka se wele phapošing e tee.</p>
<ol class="steps">
  <li>Molaodi o oketša diphapoši gatee ka fase ga <span class="ui">Diphapoši</span>, <span class="ui">Diphapoši tša Dikopano</span>.</li>
  <li>Bula <span class="ui">Diphapoši</span>, <span class="ui">Dipukelo</span>, kgetha phapoši, gomme o tobetše nako ye e lokologilego khalendareng ya beke.</li>
  <li>Fa kopano leina le nako. O ka puka legatong la motho e mongwe.</li>
</ol>
<ul>
  <li><strong>Go thulana go a swarwa</strong> pele go direga: nako ye e šetšego e tšerwe e ka se pukwe gabedi.</li>
  <li><strong>Boeletša pukelo</strong> letšatši le letšatši, beke le beke goba kgwedi le kgwedi, go fihla go makga a 52. Fetoša kopano e tee ka gare ga tatelano, goba o khansele ye le tšohle tšeo di tlago ka morago ga yona. Dikopano tša kgale di a bolokwa.</li>
  <li><strong>Dikgopotšo</strong> di ya ka imeile ka 07:00 ka letšatši la kopano. Kopano ye e lego pele ga 08:00 e gopotšwa mesong ya letšatši la pele.</li>
</ul>
<h3>O nyaka phapoši yeo motho e mongwe a šetšego a na le yona?</h3>
<p>Tobetša pukelo ya gagwe gomme o e kgopele, o fa lebaka. O hwetša imeile gomme o a kgetha. Ga go selo seo se fetogago ntle le ge a re ee.</p>
<div class="note">
  <span class="lbl">Ga o bone Diphapoši?</span>
  <p>Go puka le go laola diphapoši ke ditumelelo. Molaodi o di swaya ka fase ga <span class="ui">Taolo</span>, <span class="ui">Dikarolo</span>.</p>
</div>`,
    },
    {
      title: "Go tsebiša mang le mang",
      html: `
<p class="lede">Diimeile tše pedi tšeo di go gopotšago batho legatong la gago.</p>
<h3>Kaonafatšo ya beke</h3>
<p>Ka fase ga <span class="ui">Taolo</span>, <span class="ui">Kaonafatšo ya Beke</span>: imeile e tee ka beke go mošomiši o mongwe le o mongwe wa phothale, e na le mešomo ye e sa dirwago, tšhelete ye e letetšego tumelelo, bao ba sešogo ba tsena, le metsotso ye e sa letetšego mesaeno. Kgetha letšatši le nako, swaya <span class="ui">Romela kaonafatšo ya beke ka boyona</span> gomme o boloke. Ga go selo seo se romelwago go fihlela o dira bjalo.</p>
<h3>Kakaretšo ya mešomo ya go dirwa</h3>
<p>Ka fase ga <span class="ui">Taolo</span>, <span class="ui">Imeile ya Kakaretšo ya Mešomo</span>: rekhoto ka moka ya mešomo ye e sa dirwago bjalo ka faele ya Excel, ka lenaneo leo o le kgethago, go batho le maswao ao o a kgethago. Leswao le lebelelwa nako le nako ge e romelwa, ka fao motho yo a fiwago leswao kgwedi ye e tlago o tla ba go ye e latelago.</p>
<div class="note">
  <span class="lbl">E leke go wena pele</span>
  <p>Matlakala ka bobedi a go dumelela go romela kakanyo ka imeile go wena pele ga ge selo se ya go ${body} ka moka.</p>
</div>`,
    },
    {
      title: "Batho, bašomiši le maswao",
      html: `
<p class="lede">Dilo tše tharo tše di fapanego tšeo go lego bonolo go di tlhakatlhakanya.</p>
<ul>
  <li><strong>Motho</strong> o rekhotong ya ${body}. O swere maemo gomme o na le aterese ya imeile. A ka no se be le go tsena le gatee.</li>
  <li><strong>Mošomiši</strong> a ka tsena phothaleng. Seo a ka se dirago se laolwa ke <strong>karolo</strong> ya gagwe, ka fase ga <span class="ui">Taolo</span>, <span class="ui">Dikarolo</span>.</li>
  <li><strong>Leswao</strong> le fa sehlopha sa batho leina, gomme ke lona le laolago gore ke mang yo a dumelelago tšhomišo le gore ke mang yo a amogelago metsotso efe.</li>
</ul>
<p>Leswao le ka ba go motho goba go mošomiši, ka fao motho yo a se nago go tsena a sa kgona go amogela metsotso. Maswao a beakanywa ka fase ga <span class="ui">Taolo</span>, <span class="ui">Maswao</span>, gomme a bewa go tšwa go <span class="ui">Taolo</span>, <span class="ui">Batho le Maemo</span> goba <span class="ui">Bašomiši</span>.</p>
<div class="careful">
  <span class="lbl">Beakanya maswao a metsotso pele ga kopano ya mathomo</span>
  <p>Ka fase ga <span class="ui">Taolo</span>, <span class="ui">Taolo ya Metsotso</span>, bolela gore ke leswao lefe le le hlahlobago kakanyo, lefe le le saenago, le gore ke mang yo a amogelago metsotso ye e saennwego. Go romela kakanyo goba go bula go saena go tla gana go fihlela tšeo di le gona, gomme go tla bolela peakanyo yeo o swanetšego go e lokiša go e na le go romela lefeleng la lefeela.</p>
</div>`,
    },
    {
      title: "Go e dira e swane le sekolo sa gago",
      html: `
<p class="lede">Leswao la sekolo sa gago le mebala ya lena.</p>
<p>Ka fase ga <span class="ui">Taolo</span>, <span class="ui">Leswao la Sekolo</span>:</p>
<ul>
  <li><strong>Leswao la sekolo sa gago</strong>, leo le bonagalago letlakaleng la go tsena, lenaneong la ka thoko, imeileng ye nngwe le ye nngwe yeo phothale e e romelago le godimo ga metsotso ya lena ya Word.</li>
  <li><strong>Mebala ye mebedi</strong>, o mogolo le wa tlaleletšo. Tše dingwe ka moka di dirwa go tšwa go yona, go akaretšwa go netefatša gore mongwalo o dula o balega godimo ga mmala wa gago o mogolo.</li>
  <li><strong>Aterese ya karabo</strong>, ka fao motho yo a arabago imeile ya phothale a fihla lepokising la imeile leo motho a le balago.</li>
</ul>
<div class="note">
  <span class="lbl">Go fihlela o laiša leswao la sekolo</span>
  <p>Phothale e bontšha leswao le bonolo go e na le go akanya. E ka se tsoge e bontšhitše leswao la sekolo se sengwe.</p>
</div>`,
    },
    {
      title: "Go boloka rekhoto",
      html: `
<p class="lede">Se se diragetšego, se se rometšwego, le kopi ya tšohle.</p>
<ul>
  <li><strong>Puku ya Ditiro</strong> e ngwala tiro ye nngwe le ye nngwe ye e dirilwego phothaleng, gore e dirilwe ke mang le neng, go akaretšwa go tsena. Ke rekhoto yeo mohlahlobi wa dipuku a e kgopelago.</li>
  <li><strong>Diimeile tše di rometšwego</strong> e ngwala imeile ye nngwe le ye nngwe yeo phothale e e rometšego, gore e ile go mang le ge e amogetšwe. Dikhoutu le dikgokagano tša sephiri di a phumolwa.</li>
  <li><strong>Boloka Kopi ya Tshedimošo</strong> e theolla kopi ye e feletšego ya tshedimošo ya sekolo sa gago bjalo ka faele ya ZIP: bašomiši, melaotshepetšo, ditokumente, ditlhahlobo, tšhomišo le dipeakanyo.</li>
</ul>
<div class="note">
  <span class="lbl">Motho o re ga se a ka a hwetša imeile?</span>
  <p>Mo nyake pele go <span class="ui">Diimeile tše di rometšwego</span>. Ge e amogetšwe, e fihlile lenaneong la gagwe la imeile, ka fao mo kgopele go lebelela foldareng ya ditšhila (junk).</p>
</div>`,
    },
    {
      title: "Diimeile tšeo phothale e di romelago",
      html: `
<p class="lede">Tšohle tšeo phothale e di romelago legatong la sekolo.</p>
<div class="tw">
<table>
  <thead><tr><th>Imeile</th><th>E ya go</th><th>Neng</th></tr></thead>
  <tbody>
    <tr><td>O amogelwa</td><td>Mošomiši yo moswa</td><td>Akhaonto ya gagwe e hlolwa</td></tr>
    <tr><td>Bea lentšu la gago la sephiri</td><td>Mošomiši</td><td>O šomiša O lebetše lentšu la sephiri, goba molaodi o romela kgokagano</td></tr>
    <tr><td>Tumelelo e a nyakega</td><td>Modumelledi yo mongwe le yo mongwe yo a nyakegago</td><td>Kgopelo ya tšhelete e romelwa</td></tr>
    <tr><td>Sephetho se ngwadilwe</td><td>Mokgopedi</td><td>Modumelledi yo mongwe le yo mongwe o tšea sephetho</td></tr>
    <tr><td>Metsotso ya go hlahlobja</td><td>Mang le mang yo a lego lenaneong la dikakanyo</td><td>Kakanyo e romelwa gore e hlahlobjwe</td></tr>
    <tr><td>Diphetogo di kgopetšwe</td><td>Mongwaledi</td><td>Mohlahlobi o bušetša kakanyo morago</td></tr>
    <tr><td>Khoutu ya gago ya go saena</td><td>Mosaeni yo mongwe le yo mongwe</td><td>Go saena go a bulwa, goba khoutu e romelwa gape</td></tr>
    <tr><td>Metsotso ye e saennwego</td><td>${body}</td><td>Mosaeno wa mafelelo o a fihla, goba motho o e romela ka seatla</td></tr>
    <tr><td>Mošomo o abetšwe</td><td>Batho bao ba abetšwego</td><td>Mošomo o a tšweletšwa goba o abelwa gape</td></tr>
    <tr><td>Kgopotšo ya mošomo</td><td>Yo mošomo o mo gopotšago</td><td>Pele ga letšatši la mafelelo, ke moka e a boeletšwa</td></tr>
    <tr><td>Phapoši e pukilwe goba e fetotšwe</td><td>Motho yo phapoši e mo pukeletšwego</td><td>Pukelo e a dirwa, e a fetošwa goba e a khanselwa</td></tr>
    <tr><td>Kgopotšo ya phapoši</td><td>Motho yo phapoši e mo pukeletšwego</td><td>07:00 ka letšatši la kopano</td></tr>
    <tr><td>A ba ka hwetša phapoši?</td><td>Yo a nago le pukelo</td><td>Motho o kgopela nako ya gagwe</td></tr>
    <tr><td>Kaonafatšo ya beke</td><td>Mošomiši yo mongwe le yo mongwe wa phothale</td><td>Letšatši le nako yeo o e kgethilego</td></tr>
    <tr><td>Kakaretšo ya mešomo ya go dirwa</td><td>Batho le maswao ao o a kgethilego</td><td>Lenaneo leo o le kgethilego</td></tr>
  </tbody>
</table>
</div>
<div class="careful">
  <span class="lbl">Dikarabo ga di fihle go rena ka tlwaelo</span>
  <p>Imeile ya phothale e romelwa go tšwa atereseng yeo e sa amogelego imeile. Bea <strong>aterese ya karabo</strong> ka fase ga <span class="ui">Taolo</span>, <span class="ui">Leswao la Sekolo</span> gore karabo e fihle go motho kua ${school}.</p>
</div>`,
    },
  ],
};
