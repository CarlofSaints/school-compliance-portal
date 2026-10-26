import type { GuideText } from "./types";

// isiZulu translation of en.ts. Keep the chapters, tags and class names in step with en.ts.
export const zu: GuideText = {
  title: "Umhlahlandlela Wephothali",
  standfirst:
    "Indlela yokusebenzisa iphothali: lapho izinqubomgomo zigcinwa khona, ukuthi inqubomgomo ihlolwa kanjani ngokomthetho, ukuthi imali icelwa futhi igunyazwa kanjani, ukuthi amaminithi omhlangano abhalwa, ahlolwa, asayinwa futhi aphendulwe kanjani abe yizenzo, nokuthi amagumbi abhukwa kanjani. Kubhalelwe amalungu omkhandlu, hhayi ochwepheshe bamakhompyutha.",
  chapter: "Isahluko",
  contents: "Okuqukethwe",
  edition: "Uhlelo",
  standard: "Okujwayelekile",
  covers: (n) => `Kuqukethe izahluko ezingu-${n}`,
  chapters: (school, body) => [
    {
      title: "Ukungena",
      html: `
<p class="lede">Wonke umuntu osebenzisa iphothali unokungena kwakhe. Ayikho iphasiwedi okwabelwana ngayo.</p>
<ol class="steps">
  <li>Iya ekhelini lephothali lesikole sakho bese ungena nge-imeyili yakho.</li>
  <li>Ingabe uqala ukufika lapha, noma uyikhohlwe? Sebenzisa <span class="ui">Ukhohlwe iphasiwedi yakho?</span> ekhasini lokungena. Kufika isixhumanisi nge-imeyili, futhi sisebenza cishe ihora elilodwa.</li>
  <li>Isixhumanisi sisebenza kanye kuphela. Uma usubeke iphasiwedi siyayeka ukusebenza, ngakho cela esisha kunokusebenzisa i-imeyili endala.</li>
</ol>
<div class="note">
  <span class="lbl">Akufikanga lutho?</span>
  <p>Qala ngokubheka ifolda ye-junk. Izinhlelo ze-imeyili zezikole ziyaqaphela uma i-imeyili ivela ekhelini ezingakaze zilibone. Uma ingekho lapho, cela umphathi ukuthi abheke ikheli eligcinwe ngawe ngaphansi kokuthi <span class="ui">Admin</span>, <span class="ui">Abasebenzisi</span>: isixhumanisi esithunyelwe ekhelini elingafundwa muntu sibukeka ngokufanayo nesixhumanisi esingakaze sithunyelwe.</p>
</div>`,
    },
    {
      title: "Ukuthola indlela yakho",
      html: `
<p class="lede">Ibha esemaceleni iyiphothali yonke. Okubonayo kuncike kulokho ovunyelwe ukukwenza.</p>
<ul>
  <li><strong>Ideshibhodi</strong> iyisifinyezo: izenzo ezisalindile, imali elinde ukugunyazwa, nokuhlolwa kokuthobela imithetho kwakamuva.</li>
  <li><strong>Abantu</strong> luhlu lwe-${body}: ubani ophethe isiphi isikhundla njengamanje.</li>
  <li><strong>Izinto Zokwenziwa</strong> zikhombisa ukuthi ubani uvumile ukwenza ini, futhi nini.</li>
  <li><strong>Amaminithi Omhlangano</strong> yilapho amaminithi abhalwa khona, ahlolwe futhi asayinwe.</li>
  <li><strong>Umhlahlandlela</strong> yile dokhumenti.</li>
  <li><strong>Izinqubomgomo</strong>, <strong>Ukuthobela imithetho</strong> kanye <strong>Namadokhumenti</strong> kugcina amadokhumenti okubusa nokuhlolwa okwenziwe kuwo.</li>
  <li><strong>Ukusetshenziswa Kwemali</strong> kunezicelo zemali, izingcaphuno, ukugunyazwa kanye nemibiko yesabelomali.</li>
  <li><strong>Amagumbi</strong> yikhalenda lamagumbi omhlangano.</li>
  <li><strong>Admin</strong> yikho konke okusethwa kanye: abasebenzisi, izindima, amathegi, uphawu, ama-imeyili nezilungiselelo.</li>
</ul>
<p>Uma ikhasi olilindele lingekho, kungenxa yemvume, akulona iphutha. Umphathi angayinika ngaphansi kokuthi <span class="ui">Admin</span>, <span class="ui">Izindima</span>.</p>`,
    },
    {
      title: "Ukufunda iphothali ngolimi lwakho",
      html: `
<p class="lede">Iphothali ikhuluma izilimi eziyisikhombisa: isiNgisi, isiBhunu, isiZulu, isiXhosa, isiPedi, isiTswana nesiSuthu.</p>
<p>Khetha ulimi lwakho ebhokisini elingenhla kwesokudla kunoma yiliphi ikhasi, ngisho nasekhasini lokungena. Zonke izinkinobho, amalebula, imilayezo kanye nalo mhlahlandlela kushintsha ngaso leso sikhathi, futhi iphothali ikhumbula ukukhetha kwakho kuleyo divayisi. Lokhu akukhokhelwa.</p>
<h3>Amadokhumenti esikole sakho</h3>
<p>Inqubomgomo noma amaminithi abhalwe yisikole sakho, ngakho asikho isichazamazwi esikwaziyo ngaphambili. Lokho kuhunyushwa uma kucelwa, futhi kukhokhelwa ngamakhredithi okuhumusha.</p>
<ul>
  <li>Amakhredithi abiza u-R100 ngamashumi ayi-10 futhi awaphelelwa yisikhathi. Wa-oda ngaphansi kokuthi <span class="ui">Admin</span>, <span class="ui">Amakhredithi Okuhumusha</span>.</li>
  <li>Ikhredithi eyodwa ihumusha amakhasi afika kwayi-10 edokhumenti eyodwa ibe ngolimi olulodwa.</li>
  <li>Uma idokhumenti isihunyushiwe, wonke umuntu esikoleni sakho uyayifunda ngalolo limi mahhala.</li>
</ul>
<div class="note">
  <span class="lbl">Ubani ongasebenzisa amakhredithi</span>
  <p>Akekho ongasebenzisa amakhredithi kuze kube umphathi uthikha okuthi <span class="ui">Angasebenzisa amakhredithi okuhumusha</span> kulowo muntu ngaphansi kokuthi <span class="ui">Admin</span>, <span class="ui">Abasebenzisi</span>.</p>
</div>`,
    },
    {
      title: "Abantu Bethu",
      html: `
<p class="lede">Ubani ohlala ku-${body} wakho njengamanje, futhi usesiphi isikhundla.</p>
<p><span class="ui">Abantu</span> ikhombisa wonke umuntu osohlwini njengekhadi elinesikhundla sakhe ne-imeyili yakhe, futhi ungasesha ngegama noma ngesikhundla. Iyimpendulo yombuzo othi "ubani umgcinimafa wethu kulo nyaka?"</p>
<ol class="steps">
  <li>Luhlale lusesikhathini ngaphansi kokuthi <span class="ui">Admin</span>, <span class="ui">Abantu Nezikhundla</span>. Lubuyekeze ngalo lolo suku umuntu ejoyina noma ehamba.</li>
  <li>Uhlu lwezikhundla, nokuhleleka kwekhasi, kusethwa ngaphansi kokuthi <span class="ui">Admin</span>, <span class="ui">Izinhlobo Zabantu</span>.</li>
</ol>
<div class="note">
  <span class="lbl">Umuntu akadingi ukungena</span>
  <p>Umuntu osohlwini angathola amaminithi nezikhumbuzo nge-imeyili ngaphandle kokungena nakanye. Mnike ukungena kuphela uma edinga ukusebenzisa iphothali.</p>
</div>`,
    },
    {
      title: "Izinqubomgomo",
      html: `
<p class="lede">Zonke izinqubomgomo zokubusa endaweni eyodwa, nomlando wazo wonke.</p>
<p>Layisha inqubomgomo bese iphothali iyigcina nomlando wezinguqulo, ngakho ikhophi i-${body} eyigunyaze ngoMashi isekhona ngisho seyibuyekezwe ngoSeptemba. Akukho okubhalwa phezu kwakho futhi akukho okulahlekayo.</p>
<ol class="steps">
  <li><span class="ui">Izinqubomgomo</span>, bese kuba <span class="ui">Layisha Inqubomgomo</span>.</li>
  <li>Yinike igama umuntu angalisesha, hhayi igama lefayela, bese ukhetha isigaba.</li>
  <li>Ukufaka esikhundleni inqubomgomo ekhona kwengeza inguqulo, akudali inqubomgomo yesibili.</li>
</ol>
<p>Izigaba (Ezezimali, Ukubusa, Ukuphepha njalonjalo) ungazishintsha ngaphansi kokuthi <span class="ui">Admin</span>, <span class="ui">Izigaba Zezinqubomgomo</span>.</p>`,
    },
    {
      title: "Ukwenza ukuhlolwa kokuthobela imithetho",
      html: `
<p class="lede">Layisha idokhumenti bese uthola amaphuzu okuthobela umthetho wezemfundo waseNingizimu Afrika, nezikhala ezibhalwe ngazinye.</p>
<p>Ukuhlolwa kwenziwa ngokwe-<strong>BELA Act</strong>, i-<strong>SASA</strong> kanye nemithethonqubo yesifundazwe. Uthola amaphuzu, futhi ngaphansi kwawo izikhala ezitholakele: ukudluliselwa kwamandla okungabhalwanga, isinqumo sonyaka esingekho, noma umthetho wokuziphatha osuphelelwe yisikhathi.</p>
<ul>
  <li>Hlola inqubomgomo ngqo ekhasini layo nge-<span class="ui">Qalisa Ukuhlolwa Kokuthobela Imithetho</span>, noma ulayishe noma yiliphi ifayela ngaphansi kokuthi <span class="ui">Ukuthobela imithetho</span>, <span class="ui">Qalisa Ukuhlola</span>.</li>
  <li>Amadokhumenti angezona izinqubomgomo, njengesivumelwano noma uhlelo, afakwa ngaphansi kokuthi <span class="ui">Amadokhumenti</span> futhi ahlolwa ngendlela efanayo.</li>
</ul>
<h3>Imihlahlandlela yenu</h3>
<p>Ngaphansi kokuthi <span class="ui">Ukuthobela imithetho</span>, <span class="ui">Imihlahlandlela</span> ungalayisha imithetho ukuhlolwa okufanele kuyilinganise nayo: incwadi yesifundazwe, noma esikoleni esizimele, imithetho yebhodi lenu. Konke ukuhlolwa okulandelayo kuyayicabangela.</p>
<div class="careful">
  <span class="lbl">Ukuthi ukuhlolwa kuyini nokuthi akuyini</span>
  <p>Kuveza izikhala uma kuqhathaniswa nomthetho. Akusenzi isikole sithobele imithetho, futhi akusona iseluleko sezomthetho. Inzuzo ukuthi umuntu angakwenza ngoLwesibili ntambama, esikhundleni sokuthola lezo zikhala ngesikhathi sokucwaningwa kwamabhuku.</p>
</div>
<p>Konke ukuhlolwa kuyagcinwa, ngakho amaphuzu angaqhathaniswa ngemuva kokubuyekezwa kwenqubomgomo.</p>`,
    },
    {
      title: "Ukufaka isicelo semali",
      html: `
<p class="lede">Indlela iphrojekthi ecela ngayo imali ku-${body}.</p>
<p>Zonke izicelo zidlula efomini elifanayo noma ngabe yimalini. Amanani amancane ayabhalwa kunokuba athunyelwe ukuze agunyazwe, kodwa adlula emnyango ofanayo, ngakho isikole sigcina sinerekhodi elilodwa eliphelele lokuthi kusetshenziswe malini nokuthi kungani.</p>
<ul>
  <li><strong>Iphrojekthi nokuthi ingeyani.</strong> Yibhalele umuntu obengekho emhlanganweni.</li>
  <li><strong>Inani elilinganisiwe.</strong> Lokhu kunquma ukuthi iwela kuliphi ibhendi lokugunyaza.</li>
  <li><strong>Lapho imali ivela khona.</strong> Isicelo esisodwa singahlukaniswa phakathi kwemithombo eminingana.</li>
  <li><strong>Izingcaphuno.</strong> Zinamathisele bese ubhala ukuthi yimuphi umhlinzeki okhethiwe.</li>
</ul>`,
    },
    {
      title: "Ukugunyaza ukusetshenziswa kwemali",
      html: `
<p class="lede">Ukuthi ubani okufanele agunyaze isicelo kunqunywa yinani, futhi kusethwa kanye.</p>
<p>Ngaphansi kokuthi <span class="ui">Admin</span>, <span class="ui">Izilungiselelo Zokugunyaza</span>, amabhendi amanani ahlanganiswa namaqembu abantu. Ngaphansi kwenani elithile isicelo siyabhalwa kuphela; ngaphezu kwelinye siya ekomidini lezimali. Setha amabhendi kanye, bese zonke izicelo ezilandelayo zizihambela endleleni efanele.</p>
<div class="careful">
  <span class="lbl">Abagunyazi BAYANQUNYWA uma isicelo sithunyelwa</span>
  <p>Noma ubani obedingeka ngesikhathi sithunyelwa uhlala edingeka. Ikomidi elithola ilungu elisha ngesonto elizayo alisivuli kabusha isicelo esesinqunyiwe.</p>
</div>
<p>Abagunyazi ngabantu abaqanjwe ngamagama abaku-<strong>thegi</strong>, hhayi isikhundla somsebenzi, ngoba igunya lokugunyaza lingelomuntu, hhayi elendima.</p>`,
    },
    {
      title: "Isabelomali nemibiko yokusetshenziswa kwemali",
      html: `
<p class="lede">Ukuthi i-${body} ibeke eceleni malini, kuthenjiswe malini, futhi kusetshenziswe malini.</p>
<p>Ngaphansi kokuthi <span class="ui">Admin</span>, <span class="ui">Izilungiselelo Zokusetshenziswa Kwemali</span>, setha unyaka wesabelomali, isabelomali se-CAPEX sisonke kanye nenyanga unyaka wenu wezimali ophela ngayo. Imithombo yemali (i-CAPEX, ukuqoqwa kwemali njalonjalo) nayo ibhalwe lapho, futhi ungengeza eyakho.</p>
<p><span class="ui">Ukusetshenziswa Kwemali</span>, <span class="ui">Imibiko</span> bese kukhombisa:</p>
<ul>
  <li><strong>Isabelomali uma siqhathaniswa nokusetshenzisiwe:</strong> isabelomali, okuthenjisiwe (okugunyaziwe) nokusetshenziswe ngempela (okuqediwe).</li>
  <li><strong>Umthombo ngamunye wemali:</strong> okucelwe, okuthenjisiwe nokusetshenzisiwe.</li>
  <li><strong>Iphrojekthi ngayinye:</strong> ubani owacela, malini, izingcaphuno, umhlinzeki nokuthi isiqhubeke kangakanani.</li>
</ul>
<p><span class="ui">Thumela ku-Excel</span> inika umgcinimafa izibalo ezifanayo njengespredishithi.</p>`,
    },
    {
      title: "Ukubhala amaminithi",
      html: `
<p class="lede">Lapho irekhodi lomhlangano libhalwa khona, nokuthi yini elenza libe yidokhumenti yesikole uqobo.</p>
<p>Vula <span class="ui">Amaminithi Omhlangano</span> bese ukhetha <span class="ui">Engeza amaminithi</span>. Kunezindlela ezimbili zokungena futhi zombili ziphelela endaweni efanayo.</p>
<h3>Ukuqala ngesifanekiso</h3>
<p>Isifanekiso yisimo somhlangano: izingxenye i-${body} yakho ehlala izixoxa, ngokulandelana, namagama ajwayelekile asevele egcwalisiwe. Uhlu lokuba khona alushintshi kakhulu, ngakho luhlala esifanekisweni futhi luyalungiswa kunokuba lubhalwe kabusha. Izifanekiso zakhiwa ngaphansi kokuthi <span class="ui">Admin</span>, <span class="ui">Umphathi Wamaminithi</span>.</p>
<ol class="steps">
  <li>Khetha <span class="ui">Wabhale lapha</span> bese ukhetha isifanekiso.</li>
  <li>Qamba amaminithi, khetha umhlangano, bese usetha isikhathi. Isikhathi singaba yinyanga, ikota, noma izinsuku ozikhethayo.</li>
  <li>Bhala engxenyeni ngayinye. Ingxenye ngayinye inesihloko, okuxoxiwe, nobani obhekene nakho.</li>
</ol>
<div class="note">
  <span class="lbl">Kungani izinombolo ziqala phakathi nendawo</span>
  <p>Ukuba khona nokuxolisa akuyona into enenombolo, ngakho izinombolo zivamise ukuqala engxenyeni yesibili noma yesithathu. Noma ubani osetha isifanekiso unquma ukuthi iyiphi ingxenye eyinombolo 1.</p>
</div>
<h3>Ukulayisha amaminithi osunawo</h3>
<p>Uma unobhala ebhala ku-Word, khetha <span class="ui">Layisha ifayela</span>. Ifayela ligcinwa njengoba linjalo, futhi amaminithi asengahlolwa futhi asayinwe.</p>
<h3>Idokhumenti ye-Word</h3>
<p><span class="ui">Landa njenge-Word</span> ikhiqiza idokhumenti yokuphrinta noma yokusabalalisa. Uphawu lwesikole sakho luba phezulu, bese amaminithi elandela etafuleni elinezinombolo elingena ekhasini.</p>`,
    },
    {
      title: "Ukuthumela okusalungiswa ukuze kuhlolwe",
      html: `
<p class="lede">Ngaphambi kokuthi kusayine muntu, okusalungiswa kuya kubantu abakuhlolayo.</p>
<p>Cindezela <span class="ui">Thumela okusalungiswa 1 ukuze kuhlolwe</span>. Wonke umuntu osohlwini lwesikole lokusalungiswa uthunyelelwa isixhumanisi nge-imeyili, avule amaminithi, bese ewagunyaza noma ewabuyisela.</p>
<ul>
  <li><strong>Gunyaza</strong> kusho ukuthi okusalungiswa kuyirekhodi elifanele lomhlangano.</li>
  <li><strong>Kubuyisele</strong> kucela izinguquko futhi <strong>kudinga inothi</strong>. Ngaphandle kwalo unobhala utshelwa nje ukuthi kukhona ongenelisekile.</li>
</ul>
<p>Uma umuntu oyedwa ekubuyisela, konke okusalungiswa kubuyela ngesikhathi esisodwa. Akusizi ukuqoqa okunye ukugunyazwa kwedokhumenti esibhalwa kabusha.</p>
<div class="careful">
  <span class="lbl">Ukugunyaza kungokwalokho okusalungiswa okuphendulile</span>
  <p>Amaminithi abhalwe kabusha awokusalungiswa okusha futhi adinga ukugunyazwa kwawo. Okwangaphambili kuhlala erekhodini njengomlando kodwa akubalwa. Akekho okufanele aye ekusayineni ephethe ukugunyazwa kwenguqulo engafundwanga muntu.</p>
</div>
<div class="note">
  <span class="lbl">Awudingi ukuba ngumphathi ukuze uhlole okusalungiswa</span>
  <p>Okunqumayo ukuba sohlwini okusalungiswa okuthunyelwe kulo, akukho okunye.</p>
</div>`,
    },
    {
      title: "Ukusayina amaminithi",
      html: `
<p class="lede">Ukusayina kwenzeka kudokhumenti uqobo, njengakwa-Adobe noma ku-SignNow.</p>
<p>Wonke umuntu osayinayo uthunyelelwa nge-imeyili <strong>ikhodi yakhe enezinhlamvu eziyisithupha</strong>. Isixhumanisi sivula idokhumenti yonke, futhi ukusayina kungaphansi kwayo, ngakho uyaskrola udlule kulokho ovumelana nakho usendleleni.</p>
<ol class="steps">
  <li>Vula isixhumanisi bese ufunda amaminithi.</li>
  <li>Sayina: <strong>dweba</strong> ngomunwe noma ngegundane, noma <strong>bhala</strong> igama lakho ngesandla sokusayina. Noma iyiphi indlela ivela efayeleni le-Word.</li>
  <li>Bhala ikhodi esuka ku-imeyili yakho bese uqinisekisa.</li>
</ol>
<div class="careful">
  <span class="lbl">Ikhodi iyona nto ebalulekile</span>
  <p>Iye ekhelini lakho kuphela, ayikaze igcinwe ngendlela umuntu angayifunda futhi, futhi isetshenziswa kanye. Ungayidluliseli komunye umuntu ukuze asayine esikhundleni sakho: irekhodi lizothi nguwe osayinile.</p>
</div>
<h3>Inkomba yedokhumenti</h3>
<p>Isiginesha ngayinye ibhala isigxivizo samagama ngqo asayiniwe, esikhonjiswa kumaminithi njengenkomba emfushane. Ikhophi ekhiqizwa ngonyaka ozayo ingahlolwa ngayo. Uma isiginesha iyeka ukufana, iphothali isho lokho ngokucacile kunokubala kabusha buthule, ngoba lokho kuwubufakazi bokuthi irekhodi lishintshile ngemuva kokusayinwa.</p>
<h3>Ukusayina ephepheni</h3>
<p>Landa ifayela le-Word, sayina ngesandla, bese ulayisha iskena nge-<span class="ui">Layisha ikhophi esayiniwe</span>. Lokho kuvala amaminithi ngendlela efanayo futhi kubhale isigxivizo esifanayo.</p>
<h3>Ukuthumela amaminithi asayiniwe</h3>
<p>Uma isiginesha yokugcina ifika, amaminithi asayiniwe aya ngokuzenzakalelayo kubo bonke abasohlwini lokusabalalisa. Kukhona nenkinobho ethi <span class="ui">Thumela endikimbeni ebusayo</span>, ekhombisa ngqo ukuthi izofinyelela kubani ngaphambi kokuthi uyicindezele.</p>
<div class="note">
  <span class="lbl">Sebenzisa inkinobho uma usayine ephepheni</span>
  <p>Amaminithi avalwe ngokulayisha iskena awadluli esinyathelweni sokusayina nge-elekthronikhi, ngakho akukho okuwathumela ngokuzenzakalelayo. Inkinobho iyindlela afinyelela ngayo ku-${body}, nendlela yokuwathumela futhi uma ikheli libuyisile i-imeyili.</p>
</div>
<div class="careful">
  <span class="lbl">Amaminithi asayiniwe awakwazi ukuhlelwa</span>
  <p>Uma zonke izisiginesha sezingenile, irekhodi liyavalwa. Lungisa noma yini emaminithini alandelayo. Yilokho okwenza isiginesha ibaluleke.</p>
</div>`,
    },
    {
      title: "Izinto zokwenziwa",
      html: `
<p class="lede">Uhlu lokuthi ubani uvumile ukwenza ini, futhi nini.</p>
<p><span class="ui">Izinto Zokwenziwa</span> iyigridi eyodwa yakho konke okusalindile, enomnikazi, usuku nokuthi sekuqhubeke kangakanani. Noma ubani ongenayo angakubona, ngoba umuntu ongaboni isenzo sakhe akakwazi ukusenza.</p>
<h3>Ukuphakamisa isenzo emaminithini</h3>
<p>Le yindlela yokukwenza. Vula amaminithi bese usebenzisa <span class="ui">Phakamisa isenzo</span>, noma ukhethe into esivele kuyo. Isihloko namagama abhalwe emaminithini kuyadluliselwa, ngakho uyalungisa kunokubhala kabusha lokho umhlangano okuvumile.</p>
<p>Isenzo sibe sesikhombisa ukuthi yimuphi umhlangano osivumile futhi sixhumanisa nawo. Amaminithi abhala zonke izenzo eziphume kuwo. Alukho uhlu olungahlukana nolunye.</p>
<div class="note">
  <span class="lbl">Amaminithi asayiniwe yindawo engcono yokuphakamisa izenzo</span>
  <p>Ukuphakamisa isenzo akushintshi lutho kumaminithi, futhi irekhodi elisayiniwe liyisitatimende esinegunya kakhulu salokho okuvunyelwene ngakho.</p>
</div>
<h3>Ukulandelela</h3>
<p>Iphothali ithumela isikhumbuzo nge-imeyili ezinsukwini ezithile ngaphambi kosuku lokugcina futhi ingasiphinda kuze kuvalwe isenzo. Wena ukhetha ukuthi ubani okhunjuzwayo. Akekho okufanele akhumbule ukuncenga.</p>
<p>Izigaba isenzo esingafakwa ngaphansi kwazo zisethwa ngaphansi kokuthi <span class="ui">Admin</span>, <span class="ui">Izigaba Zezenzo</span>.</p>`,
    },
    {
      title: "Ukubhuka igumbi lomhlangano",
      html: `
<p class="lede">Igumbi lebhodi nehholo kukhalenda elilodwa okwabelwana ngalo, ngakho imihlangano emibili ayilokothi ihlangane egumbini elilodwa.</p>
<ol class="steps">
  <li>Umphathi wengeza amagumbi kanye ngaphansi kokuthi <span class="ui">Amagumbi</span>, <span class="ui">Amagumbi Omhlangano</span>.</li>
  <li>Vula <span class="ui">Amagumbi</span>, <span class="ui">Ukubhuka</span>, khetha igumbi, bese uchofoza isikhala esivulekile kukhalenda leviki.</li>
  <li>Nika umhlangano igama nesikhathi. Ungabhukela omunye umuntu.</li>
</ol>
<ul>
  <li><strong>Ukungqubuzana kuyabanjwa</strong> ngaphambi kokuthi kwenzeke: isikhala esesithathiwe asikwazi ukubhukwa kabili.</li>
  <li><strong>Phinda ukubhuka</strong> nsuku zonke, masonto onke noma nyanga zonke, kuze kufike izikhathi ezingu-52. Shintsha umhlangano owodwa ochungechungeni, noma ukhansele lona nawo wonke alandelayo. Imihlangano edlule iyagcinwa.</li>
  <li><strong>Izikhumbuzo</strong> zithunyelwa nge-imeyili ngo-07:00 ngosuku lomhlangano. Umhlangano ngaphambi kuka-08:00 ukhunjuzwa ekuseni langaphambili.</li>
</ul>
<h3>Udinga igumbi elisevele linomunye?</h3>
<p>Chofoza ukubhuka kwakhe bese ulicela, unikeze isizathu. Uthola i-imeyili bese enquma. Akukho okushintshayo ngaphandle uma ethi yebo.</p>
<div class="note">
  <span class="lbl">Awuboni Amagumbi?</span>
  <p>Ukubhuka nokuphatha amagumbi yizimvume. Umphathi uyazithikha ngaphansi kokuthi <span class="ui">Admin</span>, <span class="ui">Izindima</span>.</p>
</div>`,
    },
    {
      title: "Ukugcina wonke umuntu enolwazi",
      html: `
<p class="lede">Ama-imeyili amabili akwenzela ukulandelela.</p>
<h3>Isibuyekezo samasonto onke</h3>
<p>Ngaphansi kokuthi <span class="ui">Admin</span>, <span class="ui">Isibuyekezo Samasonto Onke</span>: i-imeyili eyodwa ngesonto eya kubo bonke abasebenzisi bephothali, enezinto zokwenziwa ezivulekile, imali elinde ukugunyazwa, abangakangeni, namaminithi asalinde izisiginesha. Khetha usuku nesikhathi, thikha okuthi <span class="ui">Thumela isibuyekezo samasonto onke ngokuzenzakalelayo</span> bese ulondoloza. Akukho okuthunyelwayo uze ukwenze lokho.</p>
<h3>Isifinyezo sezinto zokwenziwa</h3>
<p>Ngaphansi kokuthi <span class="ui">Admin</span>, <span class="ui">I-imeyili Yesifinyezo Sezenzo</span>: uhlu lonke oluvulekile njengebhuku le-Excel, ngohlelo olukhethayo, kubantu namathegi owakhethayo. Ithegi ibhekwa njalo uma kuthunyelwa, ngakho umuntu othegwe ngenyanga ezayo uzoba kokulandelayo.</p>
<div class="note">
  <span class="lbl">Qala ngokuzama kuwe</span>
  <p>Womabili amakhasi akuvumela ukuthi uzithumelele isibonelo nge-imeyili ngaphambi kokuthi kuye lutho ku-${body} wonke.</p>
</div>`,
    },
    {
      title: "Abantu, abasebenzisi namathegi",
      html: `
<p class="lede">Izinto ezintathu ezihlukene okulula ukuzididanisa.</p>
<ul>
  <li><strong>Umuntu</strong> usohlwini lwe-${body}. Uphethe isikhundla futhi une-imeyili. Kungenzeka angabi nakho nhlobo ukungena.</li>
  <li><strong>Umsebenzisi</strong> angangena ephothalini. Akwazi ukukwenza kusethwa <strong>yindima</strong> yakhe, ngaphansi kokuthi <span class="ui">Admin</span>, <span class="ui">Izindima</span>.</li>
  <li><strong>Ithegi</strong> iqamba iqembu labantu, futhi iyona enquma ukuthi ubani ogunyaza imali nokuthi ubani othola maphi amaminithi.</li>
</ul>
<p>Ithegi ingaba kumuntu noma kumsebenzisi, ngakho umuntu ongenakho ukungena usengawathola amaminithi. Amathegi asethwa ngaphansi kokuthi <span class="ui">Admin</span>, <span class="ui">Amathegi</span>, futhi afakwa kusuka ku-<span class="ui">Admin</span>, <span class="ui">Abantu Nezikhundla</span> noma <span class="ui">Abasebenzisi</span>.</p>
<div class="careful">
  <span class="lbl">Setha amathegi amaminithi ngaphambi komhlangano wokuqala</span>
  <p>Ngaphansi kokuthi <span class="ui">Admin</span>, <span class="ui">Umphathi Wamaminithi</span>, sho ukuthi iyiphi ithegi ehlola okusalungiswa, iyiphi esayinayo, nokuthi ubani othola amaminithi asayiniwe. Ukuthumela okusalungiswa noma ukuvula ukusayina kuzokwenqaba kuze kube lezo zikhona, futhi kuzosho isilungiselelo okufanele silungiswe kunokuthumela ezeni.</p>
</div>`,
    },
    {
      title: "Ukwenza kubukeke njengesikole sakho",
      html: `
<p class="lede">Uphawu lwakho nemibala yakho.</p>
<p>Ngaphansi kokuthi <span class="ui">Admin</span>, <span class="ui">Uphawu Lwesikole</span>:</p>
<ul>
  <li><strong>Uphawu lwakho</strong>, oluvela ekhasini lokungena, ebheni elisemaceleni, kuyo yonke i-imeyili iphothali eyithumelayo naphezulu kwamaminithi akho e-Word.</li>
  <li><strong>Imibala emibili</strong>, owokuqala nowokugqamisa. Konke okunye kususelwa kuyo, kuhlanganise nokuqinisekisa ukuthi umbhalo uhlala ufundeka phezu kombala wakho omkhulu.</li>
  <li><strong>Ikheli lokuphendula</strong>, ukuze umuntu ophendula i-imeyili yephothali afinyelele ebhokisini leposi elifundwa ngumuntu.</li>
</ul>
<div class="note">
  <span class="lbl">Uze ulayishe uphawu</span>
  <p>Iphothali ikhombisa uphawu olulula kunokuqagela. Ayisoze yakhombisa ibheji lesinye isikole.</p>
</div>`,
    },
    {
      title: "Ukugcina irekhodi",
      html: `
<p class="lede">Okwenzekile, okuthunyelwe, nekhophi yakho konke.</p>
<ul>
  <li><strong>Irekhodi Lemisebenzi</strong> libhala zonke izenzo ezenziwe ephothalini, ukuthi ubani ozenzile futhi nini, kuhlanganise nokungena. Yilo irekhodi umcwaningi-mabhuku alicelayo.</li>
  <li><strong>Ama-imeyili athunyelwe</strong> abhala yonke i-imeyili iphothali eyithumele, ukuthi iye kubani nokuthi yamukelwe yini. Amakhodi nezixhumanisi eziyimfihlo kuyacashwa.</li>
  <li><strong>Yenza Ikhophi Yedatha</strong> ilanda ikhophi ephelele yedatha yesikole sakho njengefayela le-ZIP: abasebenzisi, izinqubomgomo, amadokhumenti, ukuhlolwa, ukusetshenziswa kwemali nezilungiselelo.</li>
</ul>
<div class="note">
  <span class="lbl">Umuntu uthi akakaze ayithole i-imeyili?</span>
  <p>Qala ngokumbheka ku-<span class="ui">Ama-imeyili athunyelwe</span>. Uma yamukelwa, yafika ohlelweni lwakhe lwe-imeyili, ngakho mcele abheke ifolda ye-junk.</p>
</div>`,
    },
    {
      title: "Ama-imeyili iphothali ewathumelayo",
      html: `
<p class="lede">Konke iphothali ekuthumelayo egameni lesikole.</p>
<div class="tw">
<table>
  <thead><tr><th>I-imeyili</th><th>Iya kubani</th><th>Nini</th></tr></thead>
  <tbody>
    <tr><td>Siyakwamukela</td><td>Umsebenzisi omusha</td><td>I-akhawunti yakhe idalwa</td></tr>
    <tr><td>Setha iphasiwedi yakho</td><td>Umsebenzisi</td><td>Usebenzisa okuthi Ukhohlwe iphasiwedi yakho?, noma umphathi uthumela isixhumanisi</td></tr>
    <tr><td>Kudingeka ukugunyazwa</td><td>Umgunyazi ngamunye odingekayo</td><td>Kuthunyelwa isicelo semali</td></tr>
    <tr><td>Isinqumo sibhaliwe</td><td>Ofake isicelo</td><td>Umgunyazi ngamunye uyanquma</td></tr>
    <tr><td>Amaminithi okuhlolwa</td><td>Wonke umuntu osohlwini lokusalungiswa</td><td>Okusalungiswa kuthunyelwa ukuze kuhlolwe</td></tr>
    <tr><td>Kucelwe izinguquko</td><td>Unobhala</td><td>Umhloli ubuyisela okusalungiswa</td></tr>
    <tr><td>Ikhodi yakho yokusayina</td><td>Osayinayo ngamunye</td><td>Ukusayina kuyavulwa, noma ikhodi ithunyelwa futhi</td></tr>
    <tr><td>Amaminithi asayiniwe</td><td>I-${body}</td><td>Isiginesha yokugcina ifika, noma umuntu uwathumela ngesandla</td></tr>
    <tr><td>Isenzo sinikeziwe</td><td>Abantu abanikeziwe</td><td>Isenzo siyaphakanyiswa noma sinikezwa omunye</td></tr>
    <tr><td>Isikhumbuzo sesenzo</td><td>Noma ubani isenzo esimlandelelayo</td><td>Ngaphambi kosuku lokugcina, bese kuyaphindwa</td></tr>
    <tr><td>Igumbi libhukiwe noma lishintshiwe</td><td>Umuntu igumbi elibhukelwe yena</td><td>Ukubhuka kuyenziwa, kuyashintshwa noma kuyakhanselwa</td></tr>
    <tr><td>Isikhumbuzo segumbi</td><td>Umuntu igumbi elibhukelwe yena</td><td>Ngo-07:00 ngosuku lomhlangano</td></tr>
    <tr><td>Bangalithola igumbi?</td><td>Noma ubani onokubhuka</td><td>Umuntu ucela isikhala sakhe</td></tr>
    <tr><td>Isibuyekezo samasonto onke</td><td>Bonke abasebenzisi bephothali</td><td>Usuku nesikhathi okukhethile</td></tr>
    <tr><td>Isifinyezo sezinto zokwenziwa</td><td>Abantu namathegi owakhethile</td><td>Uhlelo olukhethile</td></tr>
  </tbody>
</table>
</div>
<div class="careful">
  <span class="lbl">Izimpendulo azifiki kithi ngokuzenzakalelayo</span>
  <p>I-imeyili yephothali ithunyelwa ekhelini elingamukeli ama-imeyili. Setha <strong>ikheli lokuphendula</strong> ngaphansi kokuthi <span class="ui">Admin</span>, <span class="ui">Uphawu Lwesikole</span> ukuze impendulo ifinyelele kumuntu e-${school}.</p>
</div>`,
    },
  ],
};
