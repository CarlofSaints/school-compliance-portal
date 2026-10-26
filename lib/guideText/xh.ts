import type { GuideText } from "./types";

// isiXhosa translation of en.ts. Keep the chapters, tags and class names in step with en.ts.
export const xh: GuideText = {
  title: "Isikhokelo sePortal",
  standfirst:
    "Indlela yokusebenzisa iportal: apho kugcinwa khona imigaqo-nkqubo, indlela umgaqo-nkqubo ohlolwa ngayo ngokomthetho, indlela imali ecelwa nevunywa ngayo, indlela imizuzu yentlanganiso ebhalwa, ihlolwe, isayinwe yaze ijike ibe yimisebenzi, nendlela amagumbi abhukishwa ngayo. Ibhalelwe abalawuli, hayi abantu beekhompyutha.",
  chapter: "Isahluko",
  contents: "Iziqulatho",
  edition: "Uhlelo",
  standard: "Esiqhelekileyo",
  covers: (n) => `Siquka izahluko ezingama-${n}`,
  chapters: (school, body) => [
    {
      title: "Ukungena",
      html: `
<p class="lede">Wonke umntu osebenzisa iportal unendlela yakhe yokungena. Akukho password ekwabelwana ngayo.</p>
<ol class="steps">
  <li>Yiya kwidilesi yeportal yesikolo sakho uze ungene ngedilesi yakho ye-imeyile.</li>
  <li>Ngaba ulapha okokuqala, okanye uyilibele? Sebenzisa <span class="ui">Uyilibele ipassword yakho?</span> kwiphepha lokungena. Ikhonkco lifika nge-imeyile kwaye lisebenza malunga neyure enye.</li>
  <li>Ikhonkco lisebenza kanye kuphela. Xa usele umisele ipassword, liyayeka ukusebenza, ngoko cela elitsha endaweni yokusebenzisa i-imeyile endala.</li>
</ol>
<div class="note">
  <span class="lbl">Akukho nto ifikileyo?</span>
  <p>Qala ujonge kwifolda yejunk. Iinkqubo ze-imeyile zezikolo ziyayilumkela i-imeyile evela kwidilesi ezingazange ziyibone. Ukuba ayikho apho, cela umlawuli ajonge idilesi egcinwe ngawe phantsi kwe-<span class="ui">Admin</span>, <span class="ui">Abasebenzisi</span>: ikhonkco elithunyelwe kwidilesi engafundwa mntu likhangeleka ngokufanayo nekhonkco elingazange lithunyelwe.</p>
</div>`,
    },
    {
      title: "Ukufumana indlela yakho",
      html: `
<p class="lede">Ibha esecaleni yiportal yonke. Oko ukubonayo kuxhomekeke koko uvunyelwe ukukwenza.</p>
<ul>
  <li><strong>Ideshibhodi</strong> sisishwankathelo: imisebenzi engekagqitywa, inkcitho elinde ukuvunywa, nokuhlolwa kokuthobela kwakutsha nje.</li>
  <li><strong>Abantu</strong> lirejista ye-${body}: ngubani obambe esiphi isikhundla ngoku.</li>
  <li><strong>Imisebenzi eKufuneka yenziwe</strong> ibonisa ukuba ngubani ovume ukwenza ntoni, nini.</li>
  <li><strong>Imizuzu yeNtlanganiso</strong> yindawo apho imizuzu ibhalwa, ihlolwe kwaye isayinwe khona.</li>
  <li><strong>Isikhokelo</strong> lolu xwebhu.</li>
  <li><strong>Imigaqo-nkqubo</strong>, <strong>Ukuthobela</strong> kunye <strong>naMaxwebhu</strong> agcina amaxwebhu olawulo nokuhlolwa okwenziwa kuwo.</li>
  <li><strong>Inkcitho</strong> zizicelo zemali, iikowuteshini, ukuvunywa neengxelo zohlahlo-lwabiwo-mali.</li>
  <li><strong>Amagumbi</strong> yikhalenda yamagumbi entlanganiso.</li>
  <li><strong>Admin</strong> yinto yonke emiselwa kanye: abasebenzisi, iindima, iithegi, uphawu, ii-imeyile neesetingi.</li>
</ul>
<p>Ukuba iphepha obulilindele alikho, yimvume, ayisosiphoso. Umlawuli angayinika phantsi kwe-<span class="ui">Admin</span>, <span class="ui">Iindima</span>.</p>`,
    },
    {
      title: "Ukufunda iportal ngolwimi lwakho",
      html: `
<p class="lede">Iportal ithetha iilwimi ezisixhenxe: isiNgesi, isiBhulu, isiZulu, isiXhosa, isiPedi, isiTswana nesiSuthu.</p>
<p>Khetha ulwimi lwakho kwibhokisi ephezulu ngasekunene kulo naliphi na iphepha, kwanakwiphepha lokungena. Onke amaqhosha, iilebheli, imiyalezo nesi sikhokelo ziyatshintsha kwangoko, kwaye iportal iyakhumbula ukhetho lwakho kweso sixhobo. Oku akuhlawulelwa.</p>
<h3>Amaxwebhu esikolo sakho</h3>
<p>Umgaqo-nkqubo okanye imizuzu ibhalwe sisikolo sakho, ngoko akukho sichazi-magama esiyaziyo kwangaphambili. Ezo ziguqulelwa xa zicelwa, kwaye zihlawulelwa ngeekhredithi zokuguqulela.</p>
<ul>
  <li>Iikhredithi zixabisa i-R100 kwezili-10 kwaye aziphelelwa lixesha. Zi-odole phantsi kwe-<span class="ui">Admin</span>, <span class="ui">Iikhredithi Zokuguqulela</span>.</li>
  <li>Ikhredithi enye iguqulela ukuya kumaphepha ali-10 oxwebhu olunye ibe lulwimi olunye.</li>
  <li>Xa uxwebhu luguqulelwe, wonke umntu esikolweni sakho ulufunda ngolo lwimi simahla.</li>
</ul>
<div class="note">
  <span class="lbl">Ngubani onokusebenzisa iikhredithi</span>
  <p>Akukho mntu unokusebenzisa iikhredithi de umlawuli aphawule <span class="ui">Unokusebenzisa iikhredithi zokuguqulela</span> kulo mntu phantsi kwe-<span class="ui">Admin</span>, <span class="ui">Abasebenzisi</span>.</p>
</div>`,
    },
    {
      title: "Abantu Bethu",
      html: `
<p class="lede">Ngubani ohlala kwi-${body} yakho ngoku, nakwesiphi isikhundla.</p>
<p><span class="ui">Abantu</span> ibonisa wonke umntu okwirejista njengekhadi elinesikhundla sakhe nedilesi ye-imeyile, kwaye ungakhangela ngegama okanye ngesikhundla. Yimpendulo yombuzo othi "ngubani unondyebo wethu kulo nyaka?"</p>
<ol class="steps">
  <li>Yigcine ihlaziyiwe phantsi kwe-<span class="ui">Admin</span>, <span class="ui">Abantu neZikhundla</span>. Yihlaziye ngosuku umntu angena okanye ahamba ngalo.</li>
  <li>Uluhlu lwezikhundla, nolandelelwano oluvela ngalo kwiphepha, lumiselwa phantsi kwe-<span class="ui">Admin</span>, <span class="ui">Iintlobo zaBantu</span>.</li>
</ol>
<div class="note">
  <span class="lbl">Umntu akadingi ndlela yokungena</span>
  <p>Umntu okwirejista angafumana imizuzu nezikhumbuzo nge-imeyile engakhange angene. Mnike indlela yokungena kuphela ukuba kufuneka asebenzise iportal.</p>
</div>`,
    },
    {
      title: "Imigaqo-nkqubo",
      html: `
<p class="lede">Yonke imigaqo-nkqubo yolawulo kwindawo enye, kunye nembali yayo epheleleyo.</p>
<p>Layisha umgaqo-nkqubo, iportal iwugcine nembali yeenguqulelo zawo, ngoko ikopi eyavunywa yi-${body} ngoMatshi isekhona nasemva kokuba ihlaziywe ngoSeptemba. Akukho nto ibhalwa phezu kwenye, kwaye akukho nto ilahlekayo.</p>
<ol class="steps">
  <li><span class="ui">Imigaqo-nkqubo</span>, emva koko <span class="ui">Layisha uMgaqo-nkqubo</span>.</li>
  <li>Unike igama umntu angalikhangela, hayi igama lefayile, uze ukhethe udidi.</li>
  <li>Ukutshintsha umgaqo-nkqubo okhoyo kongeza uguqulelo olutsha, hayi umgaqo-nkqubo wesibini.</li>
</ol>
<p>Iindidi (Imali, Ulawulo, Ukhuseleko njalo njalo) zezakho ukuzitshintsha phantsi kwe-<span class="ui">Admin</span>, <span class="ui">Iindidi zeMigaqo-nkqubo</span>.</p>`,
    },
    {
      title: "Ukuqhuba ukuhlola ukuthobela",
      html: `
<p class="lede">Layisha uxwebhu uze ufumane amanqaku okuthobela ngokomthetho wemfundo woMzantsi Afrika, nezikhewu zidweliswe nganye nganye.</p>
<p>Ukuhlola kwenziwa ngokwe-<strong>BELA Act</strong>, i-<strong>SASA</strong> nemigaqo yephondo. Ufumana amanqaku, kwaye ngaphantsi kwawo kukho izikhewu ezifunyenweyo: ugunyaziso olungabhalwanga, isigqibo sonyaka esingekhoyo, okanye umgaqo wokuziphatha ophelelwe lixesha.</p>
<ul>
  <li>Hlola umgaqo-nkqubo ngqo kwiphepha lawo ngo-<span class="ui">Qhuba Ukuhlola uKuthobela</span>, okanye layisha nayiphi na ifayile phantsi kwe-<span class="ui">Ukuthobela</span>, <span class="ui">Qhuba Ukuhlola</span>.</li>
  <li>Amaxwebhu angengomigaqo-nkqubo, njengekhontrakthi okanye isicwangciso, aya phantsi kwe-<span class="ui">Amaxwebhu</span> kwaye ahlolwa ngendlela efanayo.</li>
</ul>
<h3>Izikhokelo zakho</h3>
<p>Phantsi kwe-<span class="ui">Ukuthobela</span>, <span class="ui">Izikhokelo</span> ungalayisha imithetho ekufuneka ukuhlola kuyisebenzise nayo: isetyhula yephondo, okanye kwisikolo esizimeleyo, imithetho yebhodi yakho. Konke ukuhlola emva koko kuyayithathela ingqalelo.</p>
<div class="careful">
  <span class="lbl">Yintoni ukuhlola, kwaye yintoni engekuko</span>
  <p>Kubonisa izikhewu ngokomthetho. Akusenzi isikolo sithobele, kwaye asilocebiso lwasemthethweni. Ixabiso lako kukuba umntu angakuqhuba ngoLwesibini emva kwemini, endaweni yokufumana ezo zikhewu zinye ngexesha lophicotho.</p>
</div>
<p>Konke ukuhlola kuyagcinwa, ngoko amanqaku angathelekiswa emva kokuba umgaqo-nkqubo uhlaziyiwe.</p>`,
    },
    {
      title: "Ukufaka isicelo semali",
      html: `
<p class="lede">Indlela iprojekthi ecela ngayo imali kwi-${body}.</p>
<p>Sonke isicelo sidlula kwifomu enye nokuba sisixa esingakanani na. Izixa ezincinci ziyabhalwa nje endaweni yokuthunyelwa ukuze zivunywe, kodwa zingena ngomnyango omnye, ngoko isikolo sigqibela sinerekhodi enye epheleleyo yoko kuchithwe nesizathu sako.</p>
<ul>
  <li><strong>Iprojekthi nenjongo yayo.</strong> Yibhalele umntu obengekho entlanganisweni.</li>
  <li><strong>Isixa esiqikelelweyo.</strong> Oku kugqiba ukuba singena kweliphi iqela lokuvunywa.</li>
  <li><strong>Apho imali ivela khona.</strong> Isicelo esinye singahlulwa phakathi kwemithombo emininzi.</li>
  <li><strong>Iikowuteshini.</strong> Zincamathisele uze ubhale ukuba ngowuphi umthengisi okhethiweyo.</li>
</ul>`,
    },
    {
      title: "Ukuvuma inkcitho",
      html: `
<p class="lede">Ngubani ekufuneka avume isicelo kugqitywa sisixa semali, kwaye kumiselwa kanye.</p>
<p>Phantsi kwe-<span class="ui">Admin</span>, <span class="ui">Iisetingi zokuVunywa</span>, amaqela ezixa adityaniswa namaqela abantu. Ngaphantsi kwesixa esithile isicelo siyabhalwa nje; ngaphezu kwesinye siya kwikomiti yezemali. Misela amaqela kanye, kwaye sonke isicelo emva koko sizihambela sodwa.</p>
<div class="careful">
  <span class="lbl">Abavumi BABETHELELWA xa isicelo singeniswa</span>
  <p>Nabani na obefuneka ngexesha isicelo singeniswa uhlala efuneka. Ikomiti efumana ilungu elitsha kwiveki ezayo ayisivuli kwakhona isicelo esele sigqitywe.</p>
</div>
<p>Abavumi ngabantu abanamagama abekwe kwi-<strong>thegi</strong>, hayi kwisihloko somsebenzi, kuba igunya lokuvuma lelomntu, hayi lendima.</p>`,
    },
    {
      title: "Uhlahlo-lwabiwo-mali neengxelo zenkcitho",
      html: `
<p class="lede">Ingakanani imali ebekwe bucala yi-${body}, ingakanani ethenjisiweyo, nengakanani esele ichithiwe.</p>
<p>Phantsi kwe-<span class="ui">Admin</span>, <span class="ui">Iisetingi zeNkcitho</span>, misela unyaka wohlahlo-lwabiwo-mali, uhlahlo-lwabiwo-mali lwe-CAPEX olupheleleyo nenyanga ophela ngayo unyaka wakho wezemali. Imithombo yemali (CAPEX, ukuqokelela imali njalo njalo) idweliswe apho, kwaye ungongeza eyakho.</p>
<p><span class="ui">Inkcitho</span>, <span class="ui">Iingxelo</span> ize ibonise:</p>
<ul>
  <li><strong>Uhlahlo-lwabiwo-mali xa luthelekiswa nenkcitho:</strong> uhlahlo-lwabiwo-mali, oko kuthenjisiweyo (kuvunyiweyo) noko kuchithwe ngokwenene (kugqityiweyo).</li>
  <li><strong>Umthombo ngamnye wemali:</strong> okuceliweyo, okuthenjisiweyo nokuchithiweyo.</li>
  <li><strong>Iprojekthi nganye:</strong> ngubani ocelileyo, ingakanani, iikowuteshini, umthengisi nokuba ikude kangakanani.</li>
</ul>
<p><span class="ui">Thumela kwi-Excel</span> inika unondyebo la manani afanayo njengespredishithi.</p>`,
    },
    {
      title: "Ukubhala imizuzu",
      html: `
<p class="lede">Apho irekhodi yentlanganiso ibhalwa khona, nento eyenza ibe luxwebhu lwesikolo ngokwaso.</p>
<p>Vula <span class="ui">Imizuzu yeNtlanganiso</span> uze ukhethe <span class="ui">Yongeza imizuzu</span>. Zimbini iindlela zokungena, kwaye zombini ziphelela kwindawo enye.</p>
<h3>Ukuqala ngetemplate</h3>
<p>Itemplate yimo yentlanganiso: amacandelo i-${body} yakho ihlala iwaxoxa, ngolandelelwano, namagama aqhelekileyo esele ebhaliwe. Uluhlu lwabakhoyo alufane lutshintshe, ngoko lugcinwa kwitemplate kwaye luyahlelwa endaweni yokuchwetheza kwakhona. Iitemplate zakhiwa phantsi kwe-<span class="ui">Admin</span>, <span class="ui">Admin yeMizuzu</span>.</p>
<ol class="steps">
  <li>Khetha <span class="ui">Zibhale apha</span> uze ukhethe itemplate.</li>
  <li>Nika imizuzu igama, khetha intlanganiso, uze umisele ixesha. Ixesha linokuba yinyanga, ikota, okanye imihla oyikhethayo.</li>
  <li>Chwetheza kwicandelo ngalinye. Icandelo ngalinye linesihloko, oko kuxoxiweyo, nokuba ngubani onoxanduva.</li>
</ol>
<div class="note">
  <span class="lbl">Kutheni amanani eqala embindini</span>
  <p>Abakhoyo nabaxolisileyo asiyonto inenombolo, ngoko amanani adla ngokuqala kwicandelo lesibini okanye lesithathu. Nabani na omisela itemplate ugqiba ukuba leliphi icandelo elinguNombolo 1.</p>
</div>
<h3>Ukulayisha imizuzu osele unayo</h3>
<p>Ukuba unobhala ubhala kwi-Word, khetha <span class="ui">Layisha ifayile</span>. Ifayile igcinwa injalo, kwaye imizuzu isenokuhlolwa nokusayinwa.</p>
<h3>Uxwebhu lwe-Word</h3>
<p><span class="ui">Khuphela njenge-Word</span> lwenza uxwebhu lokuprinta okanye lokusasaza. Isikhumbuzo sesikolo sakho sihlala phezulu, kwaye imizuzu ilandela kwitheyibhile enamanani elingana nephepha.</p>`,
    },
    {
      title: "Ukuthumela uyilo ukuze luhlolwe",
      html: `
<p class="lede">Phambi kokuba nabani na asayine, uyilo luya kubantu abaluhlolayo.</p>
<p>Cofa <span class="ui">Thumela idrafti 1 ukuze ijongwe</span>. Wonke umntu okuluhlu lwesikolo lwabahloli boyilo uthunyelelwa ikhonkco nge-imeyile, avule imizuzu, aze ayivume okanye ayibuyisele.</p>
<ul>
  <li><strong>Vuma</strong> kuthetha ukuba uyilo lirekhodi elichanekileyo lentlanganiso.</li>
  <li><strong>Yibuyisele</strong> kucela utshintsho kwaye <strong>kufuna inqaku</strong>. Ngaphandle kwalo unobhala uxelelwa nje ukuba umntu akonwabanga.</li>
</ul>
<p>Xa umntu omnye eyibuyisela, uyilo lonke lubuyela kwangoko. Akukho nto incedayo ukuqokelela ezinye izivumelwano zoxwebhu esele lubhalwa kwakhona.</p>
<div class="careful">
  <span class="lbl">Uvumo lolwoyilo oluphendulileyo</span>
  <p>Imizuzu ebhalwe ngokutsha luyilo olutsha kwaye ifuna izivumelwano zayo. Ezangaphambili zihlala kwirekhodi njengembali kodwa azibalwa. Akukho mntu ufanele aye kusayina ephethe izivumelwano zoguqulelo ekungekho mntu walufundayo.</p>
</div>
<div class="note">
  <span class="lbl">Akufuneki ube ngumlawuli ukuze uhlole uyilo</span>
  <p>Into egqibayo kukuba kuluhlu uyilo oluthunyelwe kulo, akukho nto yimbi.</p>
</div>`,
    },
    {
      title: "Ukusayina imizuzu",
      html: `
<p class="lede">Ukusayina kwenzeka kuxwebhu ngokwalo, njengoko kusenzeka kwi-Adobe okanye kwi-SignNow.</p>
<p>Wonke umntu osayinayo uthunyelelwa nge-imeyile <strong>ikhowudi yakhe yoonobumba abathandathu</strong>. Ikhonkco livula uxwebhu lonke, kwaye ukusayina kungaphantsi kwalo, ngoko uskrola udlula koko uvumelana nako usendleleni.</p>
<ol class="steps">
  <li>Vula ikhonkco uze ufunde imizuzu.</li>
  <li>Sayina: <strong>zoba</strong> ngomnwe okanye ngemawusi, okanye <strong>chwetheza</strong> igama lakho ngesandla sokusayina. Nangayiphi na indlela ivela kwifayile ye-Word.</li>
  <li>Chwetheza ikhowudi evela kwi-imeyile yakho uze uqinisekise.</li>
</ol>
<div class="careful">
  <span class="lbl">Ikhowudi ngundoqo</span>
  <p>Iye kwidilesi yakho kungekho kwenye, ayizange igcinwe ngendlela umntu anokuyifunda kwakhona, kwaye isetyenziswa kanye. Musa ukuyithumela kumntu ukuze asayine egameni lakho: irekhodi iya kuthi nguwe osayinileyo.</p>
</div>
<h3>Isalathiso soxwebhu</h3>
<p>Utyikityo ngalunye lubhala umnwe wamagama kanye asayiniweyo, oboniswa kwimizuzu njengesalathiso esifutshane. Ikopi eveliswa kunyaka ozayo ingahlolwa ngaso. Ukuba utyikityo luke lwayeka ukuhambelana, iportal iyakuxela ngokucacileyo endaweni yokubala kwakhona ithe cwaka, kuba obo bubungqina bokuba irekhodi itshintshile emva kokusayinwa.</p>
<h3>Ukusayina ephepheni</h3>
<p>Khuphela ifayile ye-Word, sayina ngesandla, uze ulayishe iskena ngo-<span class="ui">Layisha ikopi esayiniweyo</span>. Oko kuvala imizuzu ngendlela efanayo kwaye kubhala umnwe ofanayo.</p>
<h3>Ukuthumela imizuzu esayiniweyo</h3>
<p>Xa utyikityo lokugqibela lufika, imizuzu esayiniweyo iya ngokuzenzekelayo kuwo wonke umntu okuluhlu lokusasaza. Kukho neqhosha elithi <span class="ui">Thumela kwibhunga elilawulayo</span>, elichaza kanye ukuba liza kufikelela kubani phambi kokuba ulicofe.</p>
<div class="note">
  <span class="lbl">Sebenzisa iqhosha ukuba usayine ephepheni</span>
  <p>Imizuzu evalwe ngokulayisha iskena ayidluli kwinyathelo lokusayina nge-elektroniki, ngoko akukho nto iyithumelayo ngokuzenzekelayo. Iqhosha yindlela ezo zifikelela ngayo kwi-${body}, nendlela yokuthumela kwakhona ukuba idilesi ibuyisile i-imeyile.</p>
</div>
<div class="careful">
  <span class="lbl">Imizuzu esayiniweyo ayinakuhlelwa</span>
  <p>Xa lonke utyikityo lungenile, irekhodi iyavalwa. Lungisa nantoni na kwimizuzu elandelayo. Yiyo le nto eyenza utyikityo lube nexabiso.</p>
</div>`,
    },
    {
      title: "Imisebenzi ekufuneka yenziwe",
      html: `
<p class="lede">Irejista yokuba ngubani ovume ukwenza ntoni, nini.</p>
<p><span class="ui">Imisebenzi eKufuneka yenziwe</span> ligridi enye yayo yonke into engekagqitywa, enomnini, umhla nokuba ikude kangakanani. Nabani na ongenayo angayibona, kuba umntu ongakwaziyo ukubona umsebenzi wakhe akanakuwenza.</p>
<h3>Ukuphakamisa omnye kwimizuzu</h3>
<p>Le yindlela yokukwenza. Vula imizuzu uze usebenzise <span class="ui">Phakamisa umsebenzi</span>, okanye ukhethe into ovela kuyo. Isihloko namagama abhalwe emizuzwini ayadlula, ngoko uyahlela endaweni yokuchwetheza kwakhona oko kuvunyelwene ngako entlanganisweni.</p>
<p>Umsebenzi ke ubonisa ukuba yeyiphi intlanganiso eyawuvumayo kwaye unxibelelana nayo. Imizuzu idwelisa yonke imisebenzi ephuma kuyo. Akukho luhlu lunokwahlukana nolunye.</p>
<div class="note">
  <span class="lbl">Imizuzu esayiniweyo yeyona ndawo ilungileyo yokuphakamisa imisebenzi</span>
  <p>Ukuphakamisa omnye akutshintshi nto kwimizuzu, kwaye irekhodi esayiniweyo yeyona ngxelo inegunya yoko kuvunyelwene ngako.</p>
</div>
<h3>Ukuyilandelela</h3>
<p>Iportal ithumela isikhumbuzo nge-imeyile kwinani elimiselweyo leentsuku phambi komhla wokugqibela kwaye ingasiphinda de umsebenzi uvalwe. Ukhetha ukuba ngubani olandelelwayo. Akukho mntu ufuneka akhumbule ukukhathaza.</p>
<p>Iindidi umsebenzi onokufakwa phantsi kwazo zimiselwa phantsi kwe-<span class="ui">Admin</span>, <span class="ui">Iindidi zeMisebenzi</span>.</p>`,
    },
    {
      title: "Ukubhukisha igumbi lentlanganiso",
      html: `
<p class="lede">Igumbi lebhodi neholo kwikhalenda enye ekwabelwana ngayo, ngoko iintlanganiso ezimbini azisoze zibe kwigumbi elinye.</p>
<ol class="steps">
  <li>Umlawuli wongeza amagumbi kanye phantsi kwe-<span class="ui">Amagumbi</span>, <span class="ui">Amagumbi eNtlanganiso</span>.</li>
  <li>Vula <span class="ui">Amagumbi</span>, <span class="ui">Ukubhukisha</span>, khetha igumbi, uze ucofe ixesha elingenanto kwikhalenda yeveki.</li>
  <li>Nika intlanganiso igama nexesha. Ungabhukisha egameni lomnye umntu.</li>
</ol>
<ul>
  <li><strong>Ukungqubana kuyabanjwa</strong> phambi kokuba kwenzeke: ixesha elithathiweyo alinakubhukishwa kabini.</li>
  <li><strong>Phinda ukubhukisha</strong> mihla le, veki nganye okanye nyanga nganye, ukuya kuthi ga kwizihlandlo ezingama-52. Tshintsha intlanganiso enye kuthotho, okanye rhoxisa le nayo yonke elandelayo. Iintlanganiso ezidlulileyo ziyagcinwa.</li>
  <li><strong>Izikhumbuzo</strong> zihamba nge-imeyile ngo-07:00 ngosuku lwentlanganiso. Intlanganiso ephambi ko-08:00 ikhunjuzwa ngentsasa yangaphambili.</li>
</ul>
<h3>Ufuna igumbi elisele linomnye umntu?</h3>
<p>Cofa ukubhukisha kwakhe uze ulicele, unike isizathu. Ufumana i-imeyile aze agqibe. Akukho nto itshintshayo ngaphandle kokuba athi ewe.</p>
<div class="note">
  <span class="lbl">Awuboni Amagumbi?</span>
  <p>Ukubhukisha nokulawula amagumbi ziimvume. Umlawuli uziphawula phantsi kwe-<span class="ui">Admin</span>, <span class="ui">Iindima</span>.</p>
</div>`,
    },
    {
      title: "Ukugcina wonke umntu esazi",
      html: `
<p class="lede">Ii-imeyile ezimbini ezikulandelelayo endaweni yakho.</p>
<h3>Uhlaziyo lweveki</h3>
<p>Phantsi kwe-<span class="ui">Admin</span>, <span class="ui">Uhlaziyo lweVeki</span>: i-imeyile enye ngeveki eya kuye wonke umsebenzisi weportal, inemisebenzi evulekileyo, inkcitho elinde ukuvunywa, abo bangekangeni, nemizuzu esalinde utyikityo. Khetha usuku nexesha, phawula <span class="ui">Thumela uhlaziyo lweveki ngokuzenzekelayo</span> uze ugcine. Akukho nto ithunyelwayo de wenze oko.</p>
<h3>Isishwankathelo semisebenzi</h3>
<p>Phantsi kwe-<span class="ui">Admin</span>, <span class="ui">I-imeyile yesiShwankathelo seMisebenzi</span>: irejista epheleleyo evulekileyo njengencwadi yokusebenzela ye-Excel, ngeshedyuli oyikhethayo, eya kubantu nakwiithegi ozikhethayo. Ithegi ijongwa ngalo lonke ixesha kuthunyelwa, ngoko umntu othegiwe kwinyanga ezayo uba kwelandelayo.</p>
<div class="note">
  <span class="lbl">Qala uzame kuwe</span>
  <p>Omabini la maphepha akuvumela ukuba uzithumelele umboniso nge-imeyile phambi kokuba nantoni na iye kwi-${body} yonke.</p>
</div>`,
    },
    {
      title: "Abantu, abasebenzisi neethegi",
      html: `
<p class="lede">Izinto ezintathu ezahlukeneyo ekulula ukuzididanisa.</p>
<ul>
  <li><strong>Umntu</strong> ukwirejista ye-${body}. Unesikhundla kwaye unedilesi ye-imeyile. Usenokungabi nayo kwaphela indlela yokungena.</li>
  <li><strong>Umsebenzisi</strong> angangena kwiportal. Oko anokukwenza kumiselwa <strong>yindima</strong> yakhe, phantsi kwe-<span class="ui">Admin</span>, <span class="ui">Iindima</span>.</li>
  <li><strong>Ithegi</strong> inika iqela labantu igama, kwaye yiyo egqiba ukuba ngubani ovuma inkcitho nokuba ngubani ofumana yiphi imizuzu.</li>
</ul>
<p>Ithegi ingabekwa kumntu okanye kumsebenzisi, ngoko umntu ongenayo indlela yokungena usenokufumana imizuzu. Iithegi zimiselwa phantsi kwe-<span class="ui">Admin</span>, <span class="ui">Iithegi</span>, kwaye zifakwa ukusuka kwi-<span class="ui">Admin</span>, <span class="ui">Abantu neZikhundla</span> okanye <span class="ui">Abasebenzisi</span>.</p>
<div class="careful">
  <span class="lbl">Misela iithegi zakho zemizuzu phambi kwentlanganiso yokuqala</span>
  <p>Phantsi kwe-<span class="ui">Admin</span>, <span class="ui">Admin yeMizuzu</span>, chaza ukuba yeyiphi ithegi ehlola uyilo, yeyiphi esayinayo, nokuba ngubani ofumana imizuzu esayiniweyo. Ukuthumela uyilo okanye ukuvula ukusayina kuya kwala de ezo zibekho, kwaye kuchaze isetingi ekufuneka ilungisiwe endaweni yokuthumela engekhoyo.</p>
</div>`,
    },
    {
      title: "Ukwenza ifane nesikolo sakho",
      html: `
<p class="lede">Isikhumbuzo sakho nemibala yakho.</p>
<p>Phantsi kwe-<span class="ui">Admin</span>, <span class="ui">Uphawu lweSikolo</span>:</p>
<ul>
  <li><strong>Isikhumbuzo sakho</strong>, esivela kwiphepha lokungena, kwibha esecaleni, kuyo yonke i-imeyile ethunyelwa yiportal naphezulu kwimizuzu yakho ye-Word.</li>
  <li><strong>Imibala emibini</strong>, owona mbala uphambili nombala ogqamisayo. Yonke enye into isekelwe kuwo, kuquka ukuqinisekisa ukuba umbhalo uhlala ufundeka kumbala wakho ophambili.</li>
  <li><strong>Idilesi yokuphendula</strong>, ukuze umntu ophendula i-imeyile yeportal afikelele kwibhokisi yeposi efundwa ngumntu.</li>
</ul>
<div class="note">
  <span class="lbl">Ude ulayishe isikhumbuzo</span>
  <p>Iportal ibonisa uphawu olulula endaweni yokuqikelela. Ayisoze ibonise ibheji yesinye isikolo.</p>
</div>`,
    },
    {
      title: "Ukugcina irekhodi",
      html: `
<p class="lede">Kwenzeke ntoni, kwathunyelwa ntoni, nekopi yayo yonke into.</p>
<ul>
  <li><strong>Ilog yoMsebenzi</strong> idwelisa yonke into eyenziweyo kwiportal, ngubani oyenzileyo nanini, kuquka ukungena. Yirekhodi ecelwa ngumphicothi.</li>
  <li><strong>Ii-imeyile ezithunyelweyo</strong> idwelisa yonke i-imeyile ethunyelwe yiportal, ukuba iye kubani nokuba yamkelwe na. Iikhowudi namakhonkco abucala ayacinywa.</li>
  <li><strong>Gcina iDatha eyiBackup</strong> ikhuphela ikopi epheleleyo yedatha yesikolo sakho njengefayile ye-ZIP: abasebenzisi, imigaqo-nkqubo, amaxwebhu, ukuhlola, inkcitho neesetingi.</li>
</ul>
<div class="note">
  <span class="lbl">Umntu uthi akazange ayifumane i-imeyile?</span>
  <p>Qala umkhangele kwi-<span class="ui">Ii-imeyile ezithunyelweyo</span>. Ukuba yamkelwe, ifikile kwinkqubo yakhe ye-imeyile, ngoko mcele ajonge kwifolda yejunk.</p>
</div>`,
    },
    {
      title: "Ii-imeyile ezithunyelwa yiportal",
      html: `
<p class="lede">Yonke into ethunyelwa yiportal egameni lesikolo.</p>
<div class="tw">
<table>
  <thead><tr><th>I-imeyile</th><th>Iya ku</th><th>Nini</th></tr></thead>
  <tbody>
    <tr><td>Wamkelekile</td><td>Umsebenzisi omtsha</td><td>Xa i-akhawunti yakhe yenziwa</td></tr>
    <tr><td>Misela ipassword yakho</td><td>Umsebenzisi</td><td>Xa esebenzisa Uyilibele ipassword yakho?, okanye umlawuli ethumela ikhonkco</td></tr>
    <tr><td>Kufuneka uvumo</td><td>Umvumi ngamnye ofunekayo</td><td>Xa isicelo semali singeniswa</td></tr>
    <tr><td>Isigqibo sibhaliwe</td><td>Umfaki-sicelo</td><td>Xa umvumi ngamnye egqiba</td></tr>
    <tr><td>Imizuzu ekufuneka ihlolwe</td><td>Wonke umntu okuluhlu loyilo</td><td>Xa uyilo luthunyelwa ukuze luhlolwe</td></tr>
    <tr><td>Kuceliwe utshintsho</td><td>Unobhala</td><td>Xa umhloli ebuyisela uyilo</td></tr>
    <tr><td>Ikhowudi yakho yokusayina</td><td>Umsayini ngamnye</td><td>Xa ukusayina kuvulwa, okanye ikhowudi ithunyelwa kwakhona</td></tr>
    <tr><td>Imizuzu esayiniweyo</td><td>I-${body}</td><td>Xa utyikityo lokugqibela lufika, okanye umntu eyithumela ngesandla</td></tr>
    <tr><td>Umsebenzi unikiwe</td><td>Abantu abawunikiweyo</td><td>Xa umsebenzi uphakanyiswa okanye unikwa omnye umntu</td></tr>
    <tr><td>Isikhumbuzo somsebenzi</td><td>Nabani na olandelelwa ngumsebenzi</td><td>Phambi komhla wokugqibela, emva koko iyaphinda</td></tr>
    <tr><td>Igumbi libhukishiwe okanye litshintshiwe</td><td>Umntu ebhukishelwe yena igumbi</td><td>Xa ukubhukisha kwenziwa, kutshintshwa okanye kurhoxiswa</td></tr>
    <tr><td>Isikhumbuzo segumbi</td><td>Umntu ebhukishelwe yena igumbi</td><td>Ngo-07:00 ngosuku lwentlanganiso</td></tr>
    <tr><td>Bangalifumana igumbi?</td><td>Nabani na onokubhukisha</td><td>Xa umntu ecela ixesha lakhe</td></tr>
    <tr><td>Uhlaziyo lweveki</td><td>Wonke umsebenzisi weportal</td><td>Usuku nexesha olikhethileyo</td></tr>
    <tr><td>Isishwankathelo semisebenzi</td><td>Abantu neethegi ozikhethileyo</td><td>Ishedyuli oyikhethileyo</td></tr>
  </tbody>
</table>
</div>
<div class="careful">
  <span class="lbl">Iimpendulo azifiki kuthi ngokwesiqhelo</span>
  <p>I-imeyile yeportal ithunyelwa kwidilesi engafumani i-imeyile. Misela <strong>idilesi yokuphendula</strong> phantsi kwe-<span class="ui">Admin</span>, <span class="ui">Uphawu lweSikolo</span> ukuze impendulo ifikelele kumntu e-${school}.</p>
</div>`,
    },
  ],
};
