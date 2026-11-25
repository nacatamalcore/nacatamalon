/**
 * English words that are not said as the rules would say them, written by hand: each with its sounds,
 * a `|` between one and the next.
 */

/** Small words, said without stress of their own, leaning on the others. */
const SMALL = `
a AH0|am AE0 M|an AH0 N|and AH0 N D|are AA0 R|as AE0 Z|at AE0 T|be B IY0|been B IH0 N|but B AH0 T|by B AY0|can K AE0 N|could K UH0 D|do D UW0
does D AH0 Z|for F ER0|from F R AH0 M|had HH AE0 D|has HH AE0 Z|have HH AE0 V|he HH IY0|her HH ER0|him HH IH0 M|his HH IH0 Z|i AY0|if IH0 F|in IH0 N
into IH0 N T UW0|is IH0 Z|it IH0 T|its IH0 T S|may M EY0|me M IY0|might M AY0 T|must M AH0 S T|my M AY0|of AH0 V|on AA0 N|or AO0 R|our AW0 R
shall SH AE0 L|she SH IY0|should SH UH0 D|so S OW0|than DH AE0 N|that DH AE0 T|the DH AH0|thee DH IY0|their DH EH0 R|them DH EH0 M|they DH EY0
thou DH AW0|thy DH AY0|to T UW0|unto AH0 N T UW0|us AH0 S|was W AH0 Z|we W IY0|were W ER0|will W IH0 L|with W IH0 DH|would W UH0 D|ye Y IY0|you Y UW0
your Y ER0
`;

const OTHERS = `
cafay K AE0 F EY1|cafe K AE0 F EY1|clichay K L IY0 SH EY1|naive N AY0 IY1 V|grr G ER1|pfft F AH1 T|zzz Z IH0 Z|d'you D Y UW0|y'know Y AH0 N OW1|tvs T IY2 V IY1 Z
mustn't M AH1 S AH0 N T|shan't SH AE1 N T|ain't EY1 N T|hmm HH AH1 M|hm HH AH1 M|mmm AH1 M|shh SH AH0|psst P S IH0 S T|brr B ER1|mr M IH1 S T ER0
mrs M IH1 S IH0 Z|ms M IH1 Z|dr D AA1 K T ER0|vs V ER1 S AH0 S|eighth EY1 T TH|fifth F IH1 F TH|twelfth T W EH1 L F TH|rhythm R IH1 DH AH0 M
able EY1 B AH0 L|about AH0 B AW1 T|above AH0 B AH1 V|accept AE0 K S EH1 P T|accident AE1 K S AH0 D AH0 N T|account AH0 K AW1 N T|achieve AH0 CH IY1 V
achievement AH0 CH IY1 V M AH0 N T|across AH0 K R AO1 S|action AE1 K SH AH0 N|active AE1 K T IH0 V|actually AE1 K CH AH0 W AH0 L IY0
adventure AH0 D V EH1 N CH ER0|advice AH0 D V AY1 S|afraid AH0 F R EY1 D|after AE1 F T ER0|again AH0 G EH1 N|against AH0 G EH1 N S T|age EY1 JH
ago AH0 G OW1|agree AH0 G R IY1|ahead AH0 HH EH1 D|air EH1 R|alarm AH0 L AA1 R M|alien EY1 L IY0 AH0 N|alive AH0 L AY1 V|all AO1 L|allow AH0 L AW1
almost AO1 L M OW0 S T|alone AH0 L OW1 N|along AH0 L AO1 NG|already AO0 L R EH1 D IY0|also AO1 L S OW0|although AO0 L DH OW1|always AO1 L W EY0 Z
among AH0 M AH1 NG|amount AH0 M AW1 N T|ancient EY1 N SH AH0 N T|angel EY1 N JH AH0 L|angle AE1 NG G AH0 L|animal AE1 N AH0 M AH0 L
another AH0 N AH1 DH ER0|answer AE1 N S ER0|any EH1 N IY0|anything EH1 N IY0 TH IH0 NG|appear AH0 P IH1 R|area EH1 R IY0 AH0|arena AH0 R IY1 N AH0
army AA1 R M IY0|around ER0 AW1 N D|arrest ER0 EH1 S T|arrive ER0 AY1 V|ask AE1 S K|asleep AH0 S L IY1 P|attack AH0 T AE1 K
attention AH0 T EH1 N SH AH0 N|autumn AO1 T AH0 M|awake AH0 W EY1 K|aware AH0 W EH1 R|away AH0 W EY1|axe AE1 K S|baby B EY1 B IY0
balance B AE1 L AH0 N S|banana B AH0 N AE1 N AH0|barrel B AE1 R AH0 L|bathe B EY1 DH|battle B AE1 T AH0 L|beach B IY1 CH|bear B EH1 R|beast B IY1 S T
beautiful B Y UW1 T AH0 F AH0 L|beauty B Y UW1 T IY0|because B IH0 K AO1 Z|become B IH0 K AH1 M|before B IH0 F AO1 R|begin B IH0 G IH1 N
behind B IH0 HH AY1 N D|being B IY1 IH0 NG|believe B IH0 L IY1 V|best B EH1 S T|between B IH0 T W IY1 N|beyond B IH0 AA1 N D|bleed B L IY1 D
blood B L AH1 D|blow B L OW1|blown B L OW1 N|body B AA1 D IY0|bomb B AA1 M|bonus B OW1 N AH0 S|book B UH1 K|born B AO1 R N|both B OW1 TH
bottom B AA1 T AH0 M|bought B AO1 T|bow B OW1|bowl B OW1 L|boy B OY1|break B R EY1 K|breath B R EH1 TH|breathe B R IY1 DH|bridge B R IH1 JH
bring B R IH1 NG|broad B R AO1 D|brother B R AH1 DH ER0|brought B R AO1 T|brow B R AW1|brown B R AW1 N|build B IH1 L D|built B IH1 L T|bull B UH1 L
bury B EH1 R IY0|bush B UH1 SH|business B IH1 Z N AH0 S|busy B IH1 Z IY0|butcher B UH1 CH ER0|butter B AH1 T ER0|buy B AY1|bye B AY1|came K EY1 M
camera K AE1 M R AH0|can't K AE1 N T|cancel K AE1 N S AH0 L|cannot K AE1 N AA2 T|captain K AE1 P T AH0 N|capture K AE1 P CH ER0
careful K EH1 R F AH0 L|careless K EH1 R L AH0 S|castle K AE1 S AH0 L|caught K AO1 T|cause K AO1 Z|caution K AO1 SH AH0 N|caves K EY1 V Z
ceiling S IY1 L IH0 NG|cemetery S EH1 M AH0 T EH2 R IY0|center S EH1 N T ER0|certain S ER1 T AH0 N|chance CH AE1 N S|change CH EY1 N JH
chaos K EY1 AA2 S|chapter CH AE1 P T ER0|character K EH1 R IH0 K T ER0|chest CH EH1 S T|chief CH IY1 F|child CH AY1 L D|children CH IH1 L D R AH0 N
chocolate CH AO1 K L AH0 T|choose CH UW1 Z|chose CH OW1 Z|chosen CH OW1 Z AH0 N|church CH ER1 CH|city S IH1 T IY0|claim K L EY1 M|climb K L AY1 M
close K L OW1 Z|cloth K L AO1 TH|clothes K L OW1 Z|clothing K L OW1 DH IH0 NG|clown K L AW1 N|coast K OW1 S T|cold K OW1 L D|collect K AH0 L EH1 K T
color K AH1 L ER0|column K AA1 L AH0 M|combat K AA1 M B AE2 T|come K AH1 M|comfort K AH1 M F ER0 T|command K AH0 M AE1 N D|common K AA1 M AH0 N
company K AH1 M P AH0 N IY0|complete K AH0 M P L IY1 T|computer K AH0 M P Y UW1 T ER0|connect K AH0 N EH1 K T|conquest K AA1 NG K W EH2 S T
continue K AH0 N T IH1 N Y UW0|control K AH0 N T R OW1 L|corner K AO1 R N ER0|correct K ER0 EH1 K T|cost K AO1 S T|cotton K AA1 T AH0 N|cough K AO1 F
couldn't K UH1 D AH0 N T|council K AW1 N S AH0 L|country K AH1 N T R IY0|couple K AH1 P AH0 L|courage K ER1 IH0 JH|course K AO1 R S|court K AO1 R T
cousin K AH1 Z AH0 N|cover K AH1 V ER0|crazy K R EY1 Z IY0|create K R IY0 EY1 T|creature K R IY1 CH ER0|crew K R UW1|crow K R OW1|crown K R AW1 N
cruel K R UW1 AH0 L|cupboard K AH1 B ER0 D|curious K Y UH1 R IY0 AH0 S|current K ER1 AH0 N T|damage D AE1 M IH0 JH|dance D AE1 N S
danger D EY1 N JH ER0|dangerous D EY1 N JH ER0 AH0 S|dare D EH1 R|darling D AA1 R L IH0 NG|daughter D AO1 T ER0|dead D EH1 D|deaf D EH1 F|deal D IY1 L
death D EH1 TH|decide D IH0 S AY1 D|deliver D IH0 L IH1 V ER0|demon D IY1 M AH0 N|desert D EH1 Z ER0 T|desire D IH0 Z AY1 ER0|destroy D IH0 S T R OY1
device D IH0 V AY1 S|devil D EH1 V AH0 L|diamond D AY1 M AH0 N D|didn't D IH1 D AH0 N T|didst D IH1 D S T|die D AY1|different D IH1 F R AH0 N T
difficult D IH1 F AH0 K AH0 L T|difficulty D IH1 F AH0 K AH0 L T IY0|dinner D IH1 N ER0|direct D ER0 EH1 K T|direction D ER0 EH1 K SH AH0 N
disaster D IH0 Z AE1 S T ER0|discover D IH0 S K AH1 V ER0|distance D IH1 S T AH0 N S|doctor D AA1 K T ER0|doesn't D AH1 Z AH0 N T|doing D UW1 IH0 NG
don't D OW1 N T|done D AH1 N|door D AO1 R|double D AH1 B AH0 L|doubt D AW1 T|down D AW1 N|dragon D R AE1 G AH0 N|draw D R AO1|dream D R IY1 M
driven D R IH1 V AH0 N|drown D R AW1 N|dungeon D AH1 N JH AH0 N|during D UH1 R IH0 NG|dwarf D W AO1 R F|early ER1 L IY0|east IY1 S T|easy IY1 Z IY0
echo EH1 K OW0|edge EH1 JH|effect IH0 F EH1 K T|effort EH1 F ER0 T|eight EY1 T|either IY1 DH ER0|eleven IH0 L EH1 V AH0 N|empire EH1 M P AY2 ER0
empty EH1 M P T IY0|enemy EH1 N AH0 M IY0|energy EH1 N ER0 JH IY0|engine EH1 N JH AH0 N|enough IH0 N AH1 F|enter EH1 N T ER0
entrance EH1 N T R AH0 N S|equal IY1 K W AH0 L|error EH1 R ER0|even IY1 V AH0 N|evening IY1 V N IH0 NG|event IH0 V EH1 N T|ever EH1 V ER0
every EH1 V R IY0|everything EH1 V R IY0 TH IH0 NG|evil IY1 V AH0 L|exact IH0 G Z AE1 K T|example IH0 G Z AE1 M P AH0 L|except IH0 K S EH1 P T
exit EH1 G Z AH0 T|expect IH0 K S P EH1 K T|experience IH0 K S P IH1 R IY0 AH0 N S|extra EH1 K S T R AH0|eye AY1|eyes AY1 Z|face F EY1 S|fail F EY1 L
failure F EY1 L Y ER0|fairy F EH1 R IY0|family F AE1 M AH0 L IY0|famous F EY1 M AH0 S|farewell F EH2 R W EH1 L|farther F AA1 R DH ER0|fast F AE1 S T
fatal F EY1 T AH0 L|father F AA1 DH ER0|father's F AA1 DH ER0 Z|favorite F EY1 V R AH0 T|feather F EH1 DH ER0|feed F IY1 D|fellow F EH1 L OW0
female F IY1 M EY2 L|few F Y UW1|fierce F IH1 R S|fight F AY1 T|figure F IH1 G Y ER0|final F AY1 N AH0 L|finally F AY1 N AH0 L IY0|find F AY1 N D
finish F IH1 N IH0 SH|fire F AY1 ER0|five F AY1 V|flood F L AH1 D|floor F L AO1 R|flow F L OW1|flower F L AW1 ER0|focus F OW1 K AH0 S|folk F OW1 K
follow F AA1 L OW0|food F UW1 D|forbidden F ER0 B IH1 D AH0 N|forest F AO1 R AH0 S T|forever F ER0 EH1 V ER0|forget F ER0 G EH1 T
forgive F ER0 G IH1 V|forgotten F ER0 G AA1 T AH0 N|fortune F AO1 R CH AH0 N|forty F AO1 R T IY0|forward F AO1 R W ER0 D|fought F AO1 T
fountain F AW1 N T AH0 N|four F AO1 R|freeze F R IY1 Z|friend F R EH1 N D|front F R AH1 N T|frozen F R OW1 Z AH0 N|fruit F R UW1 T|fuel F Y UW1 AH0 L
full F UH1 L|furious F Y UH1 R IY0 AH0 S|future F Y UW1 CH ER0|galaxy G AE1 L AH0 K S IY0|game G EY1 M|gather G AE1 DH ER0|gear G IH1 R
general JH EH1 N R AH0 L|get G EH1 T|ghost G OW1 S T|giant JH AY1 AH0 N T|gift G IH1 F T|girl G ER1 L|give G IH1 V|given G IH1 V AH0 N|glove G L AH1 V
glow G L OW1|god G AA1 D|goes G OW1 Z|going G OW1 IH0 NG|gone G AO1 N|good G UH1 D|goodbye G UH2 D B AY1|govern G AH1 V ER0 N|grass G R AE1 S
grave G R EY1 V|gravity G R AE1 V AH0 T IY0|great G R EY1 T|ground G R AW1 N D|group G R UW1 P|grow G R OW1|grown G R OW1 N|guard G AA1 R D
guess G EH1 S|guest G EH1 S T|guests G EH1 S T S|guide G AY1 D|guild G IH1 L D|guilty G IH1 L T IY0|habit HH AE1 B AH0 T|half HH AE1 F
happen HH AE1 P AH0 N|harbor HH AA1 R B ER0|harvest HH AA1 R V AH0 S T|hath HH AE1 TH|having HH AE1 V IH0 NG|head HH EH1 D|heal HH IY1 L
health HH EH1 L TH|hear HH IH1 R|heard HH ER1 D|heart HH AA1 R T|heaven HH EH1 V AH0 N|heavenly HH EH1 V AH0 N L IY0|heavy HH EH1 V IY0
height HH AY1 T|held HH EH1 L D|hello HH AH0 L OW1|here HH IH1 R|hero HH IH1 R OW0|heroes HH IH1 R OW0 Z|herself HH ER0 S EH1 L F
himself HH IH0 M S EH1 L F|hollow HH AA1 L OW0|holy HH OW1 L IY0|home HH OW1 M|honest AA1 N AH0 S T|honestly AA1 N AH0 S T L IY0|honey HH AH1 N IY0
honor AA1 N ER0|hospital HH AA1 S P IH2 T AH0 L|host HH OW1 S T|hotel HH OW0 T EH1 L|hour AW1 ER0|house HH AW1 S|how HH AW1|however HH AW0 EH1 V ER0
human HH Y UW1 M AH0 N|hundred HH AH1 N D R AH0 D|hundreds HH AH1 N D R AH0 D Z|husband HH AH1 Z B AH0 N D|i'll AY1 L|i'm AY1 M|i've AY1 V
idea AY0 D IY1 AH0|idol AY1 D AH0 L|image IH1 M AH0 JH|imagine IH0 M AE1 JH AH0 N|immediately IH0 M IY1 D IY0 AH0 T L IY0
important IH0 M P AO1 R T AH0 N T|impossible IH0 M P AA1 S AH0 B AH0 L|indeed IH0 N D IY1 D|inside IH0 N S AY1 D|instead IH0 N S T EH1 D
interest IH1 N T R AH0 S T|invest IH0 N V EH1 S T|iron AY1 ER0 N|island AY1 L AH0 N D|isn't IH1 Z AH0 N T|it's IH1 T S|item AY1 T AH0 M
itself IH0 T S EH1 L F|jacob JH EY1 K AH0 B|jesus JH IY1 Z AH0 S|jewel JH UW1 AH0 L|join JH OY1 N|juice JH UW1 S|jungle JH AH1 NG G AH0 L
just JH AH1 S T|key K IY1|kind K AY1 N D|king K IH1 NG|kitchen K IH1 CH AH0 N|knew N UW1|knight N AY1 T|knives N AY1 V Z|know N OW1
knowledge N AA1 L IH0 JH|known N OW1 N|ladder L AE1 D ER0|lady L EY1 D IY0|language L AE1 NG G W IH0 JH|large L AA1 R JH|last L AE1 S T
later L EY1 T ER0|laugh L AE1 F|lead L IY1 D|leather L EH1 DH ER0|leave L IY1 V|leaves L IY1 V Z|left L EH1 F T|legend L EH1 JH AH0 N D
let's L EH1 T S|level L EH1 V AH0 L|lever L EH1 V ER0|library L AY1 B R EH2 R IY0|life L AY1 F|light L AY1 T|lightning L AY1 T N IH0 NG
limit L IH1 M AH0 T|linen L IH1 N AH0 N|lion L AY1 AH0 N|listen L IH1 S AH0 N|little L IH1 T AH0 L|live L IH1 V|lived L IH1 V D|lives L IH1 V Z
living L IH1 V IH0 NG|lizard L IH1 Z ER0 D|look L UH1 K|loose L UW1 S|lord L AO1 R D|lose L UW1 Z|lost L AO1 S T|love L AH1 V|low L OW1
machine M AH0 SH IY1 N|mad M AE1 D|made M EY1 D|magic M AE1 JH IH0 K|magician M AH0 JH IH1 SH AH0 N|major M EY1 JH ER0|make M EY1 K|male M EY1 L
many M EH1 N IY0|map M AE1 P|master M AE1 S T ER0|maybe M EY1 B IY0|meant M EH1 N T|measure M EH1 ZH ER0|medicine M EH1 D AH0 S AH0 N
melody M EH1 L AH0 D IY0|memory M EH1 M ER0 IY0|menu M EH1 N Y UW0|mercy M ER1 S IY0|message M EH1 S IH0 JH|metal M EH1 T AH0 L|middle M IH1 D AH0 L
million M IH1 L Y AH0 N|minor M AY1 N ER0|minus M AY1 N AH0 S|minute M IH1 N AH0 T|minutes M IH1 N AH0 T S|mirror M IH1 R ER0|missing M IH1 S IH0 NG
mode M OW1 D|model M AA1 D AH0 L|modern M AA1 D ER0 N|moment M OW1 M AH0 N T|money M AH1 N IY0|monkey M AH1 NG K IY0|monster M AA1 N S T ER0
month M AH1 N TH|more M AO1 R|morning M AO1 R N IH0 NG|most M OW1 S T|mother M AH1 DH ER0|motion M OW1 SH AH0 N|mountain M AW1 N T AH0 N|mouse M AW1 S
mouth M AW1 TH|move M UW1 V|movie M UW1 V IY0|much M AH1 CH|multiply M AH1 L T AH0 P L AY2|muscle M AH1 S AH0 L|myself M AY0 S EH1 L F
mystery M IH1 S T ER0 IY0|nation N EY1 SH AH0 N|natural N AE1 CH ER0 AH0 L|near N IH1 R|necessary N EH1 S AH0 S EH2 R IY0|need N IY1 D
neighbor N EY1 B ER0|neither N IY1 DH ER0|nephew N EH1 F Y UW0|nest N EH1 S T|never N EH1 V ER0|new N UW1|nine N AY1 N|ninth N AY1 N TH|no N OW1
noble N OW1 B AH0 L|noise N OY1 Z|none N AH1 N|northern N AO1 R DH ER0 N|not N AA1 T|nothing N AH1 TH IH0 NG|notice N OW1 T AH0 S|now N AW1
object AA1 B JH EH0 K T|oblige AH0 B L AY1 JH|obtain AH0 B T EY1 N|occur AH0 K ER1|ocean OW1 SH AH0 N|off AO1 F|offer AO1 F ER0|office AO1 F AH0 S
often AO1 F AH0 N|okay OW0 K EY1|old OW1 L D|once W AH1 N S|one W AH1 N|only OW1 N L IY0|open OW1 P AH0 N|option AA1 P SH AH0 N|orange AO1 R AH0 N JH
order AO1 R D ER0|other AH1 DH ER0|out AW1 T|outside AW0 T S AY1 D|oven AH1 V AH0 N|over OW1 V ER0|own OW1 N|oxygen AA1 K S AH0 JH AH0 N
palace P AE1 L AH0 S|panic P AE1 N IH0 K|parent P EH1 R AH0 N T|party P AA1 R T IY0|past P AE1 S T|path P AE1 TH|patient P EY1 SH AH0 N T
peace P IY1 S|people P IY1 P AH0 L|perfect P ER1 F AH0 K T|perhaps P ER0 HH AE1 P S|person P ER1 S AH0 N|peter P IY1 T ER0|piano P IY0 AE1 N OW0
piece P IY1 S|pierce P IH1 R S|pilot P AY1 L AH0 T|pirate P AY1 R AH0 T|place P L EY1 S|planet P L AE1 N AH0 T|plastic P L AE1 S T IH0 K
player P L EY1 ER0|player's P L EY1 ER0 Z|please P L IY1 Z|pleasure P L EH1 ZH ER0|poem P OW1 AH0 M|point P OY1 N T|police P AH0 L IY1 S|poor P UH1 R
position P AH0 Z IH1 SH AH0 N|possible P AA1 S AH0 B AH0 L|post P OW1 S T|potato P AH0 T EY1 T OW0|pour P AO1 R|power P AW1 ER0|prayer P R EH1 R
prepare P R IH0 P EH1 R|present P R EH1 Z AH0 N T|press P R EH1 S|pretty P R IH1 T IY0|previous P R IY1 V IY0 AH0 S|prison P R IH1 Z AH0 N
private P R AY1 V AH0 T|probably P R AA1 B AH0 B L IY0|problem P R AA1 B L AH0 M|profile P R OW1 F AY2 L|program P R OW1 G R AE2 M
progress P R AA1 G R EH2 S|project P R AA1 JH EH0 K T|promise P R AA1 M AH0 S|prophet P R AA1 F AH0 T|protest P R OW1 T EH2 S T|proud P R AW1 D
prove P R UW1 V|public P AH1 B L IH0 K|pull P UH1 L|punch P AH1 N CH|purpose P ER1 P AH0 S|push P UH1 SH|put P UH1 T|puzzle P AH1 Z AH0 L
quarter K W AO1 R T ER0|quest K W EH1 S T|question K W EH1 S CH AH0 N|quiet K W AY1 AH0 T|quit K W IH1 T|quite K W AY1 T|radio R EY1 D IY0 OW2
rather R AE1 DH ER0|read R IY1 D|ready R EH1 D IY0|real R IY1 L|really R IH1 L IY0|reason R IY1 Z AH0 N|receive R IH0 S IY1 V|record R EH1 K ER0 D
regret R IH0 G R EH1 T|release R IH0 L IY1 S|remember R IH0 M EH1 M B ER0|repair R IH0 P EH1 R|request R IH0 K W EH1 S T|rescue R EH1 S K Y UW0
resist R IH0 Z IH1 S T|rest R EH1 S T|result R IH0 Z AH1 L T|return R IH0 T ER1 N|reveal R IH0 V IY1 L|revenge R IH0 V EH1 N JH|reward R IH0 W AO1 R D
right R AY1 T|ring R IH1 NG|rise R AY1 Z|risen R IH1 Z AH0 N|ritual R IH1 CH UW0 AH0 L|rival R AY1 V AH0 L|river R IH1 V ER0|robot R OW1 B AA2 T
roll R OW1 L|rough R AH1 F|route R UW1 T|row R OW1|royal R OY1 AH0 L|ruin R UW1 AH0 N|rule R UW1 L|sacred S EY1 K R AH0 D
sacrifice S AE1 K R AH0 F AY2 S|safe S EY1 F|said S EH1 D|salad S AE1 L AH0 D|salt S AO1 L T|samaria S AH0 M EH1 R IY0 AH0|same S EY1 M|save S EY1 V
says S EH1 Z|school S K UW1 L|science S AY1 AH0 N S|scissors S IH1 Z ER0 Z|score S K AO1 R|search S ER1 CH|season S IY1 Z AH0 N|second S EH1 K AH0 N D
secret S IY1 K R AH0 T|section S EH1 K SH AH0 N|seed S IY1 D|seek S IY1 K|select S AH0 L EH1 K T|senior S IY1 N Y ER0|sense S EH1 N S
separate S EH1 P ER0 AH0 T|serious S IH1 R IY0 AH0 S|servant S ER1 V AH0 N T|settings S EH1 T IH0 NG Z|seven S EH1 V AH0 N|several S EH1 V R AH0 L
shadow SH AE1 D OW0|shoe SH UW1|shoulder SH OW1 L D ER0|shouldn't SH UH1 D AH0 N T|show SH OW1|shower SH AW1 ER0|shown SH OW1 N|shut SH AH1 T
sign S AY1 N|signal S IH1 G N AH0 L|silence S AY1 L AH0 N S|silent S AY1 L AH0 N T|simple S IH1 M P AH0 L|since S IH1 N S|sing S IH1 NG
sister S IH1 S T ER0|skeleton S K EH1 L AH0 T AH0 N|skull S K AH1 L|slow S L OW1|slowly S L OW1 L IY0|smooth S M UW1 DH|social S OW1 SH AH0 L
soldier S OW1 L JH ER0|solid S AA1 L AH0 D|solve S AA1 L V|some S AH1 M|something S AH1 M TH IH0 NG|son S AH1 N|sorcerer S AO1 R S ER0 ER0
sorry S AA1 R IY0|soul S OW1 L|soup S UW1 P|south S AW1 TH|southern S AH1 DH ER0 N|special S P EH1 SH AH0 L|speed S P IY1 D|spirit S P IH1 R AH0 T
sponge S P AH1 N JH|spread S P R EH1 D|spring S P R IH1 NG|start S T AA1 R T|statue S T AE1 CH UW0|steady S T EH1 D IY0|steak S T EY1 K
still S T IH1 L|sting S T IH1 NG|stolen S T OW1 L AH0 N|stomach S T AH1 M AH0 K|stood S T UH1 D|story S T AO1 R IY0|strange S T R EY1 N JH
stranger S T R EY1 N JH ER0|strength S T R EH1 NG K TH|string S T R IH1 NG|student S T UW1 D AH0 N T|such S AH1 CH|sudden S AH1 D AH0 N
sugar SH UH1 G ER0|suggest S AH0 G JH EH1 S T|suit S UW1 T|supply S AH0 P L AY1|support S AH0 P AO1 R T|suppose S AH0 P OW1 Z|sure SH UH1 R
surface S ER1 F AH0 S|surprise S ER0 P R AY1 Z|survive S ER0 V AY1 V|swear S W EH1 R|sweat S W EH1 T|swing S W IH1 NG|sword S AO1 R D
system S IH1 S T AH0 M|take T EY1 K|talk T AO1 K|target T AA1 R G AH0 T|taught T AO1 T|tavern T AE1 V ER0 N|teacher T IY1 CH ER0|tear T EH1 R
tennis T EH1 N AH0 S|terrible T EH1 R AH0 B AH0 L|test T EH1 S T|thank TH AE1 NG K|that's DH AE1 T S|themselves DH EH0 M S EH1 L V Z|then DH EH1 N
there DH EH1 R|these DH IY1 Z|they're DH EH1 R|thief TH IY1 F|thieves TH IY1 V Z|thing TH IH1 NG|third TH ER1 D|this DH IH1 S|thorough TH ER1 OW0
those DH OW1 Z|though DH OW1|thought TH AO1 T|thousand TH AW1 Z AH0 N D|thread TH R EH1 D|threat TH R EH1 T|throne TH R OW1 N|through TH R UW1
throw TH R OW1|thrown TH R OW1 N|thus DH AH1 S|tiger T AY1 G ER0|today T AH0 D EY1|together T AH0 G EH1 DH ER0|tomb T UW1 M|tomorrow T AH0 M AA1 R OW0
tongue T AH1 NG|tonight T AH0 N AY1 T|too T UW1|took T UH1 K|total T OW1 T AH0 L|touch T AH1 CH|tough T AH1 F|toward T AH0 W AO1 R D
towards T AH0 W AO1 R D Z|tower T AW1 ER0|town T AW1 N|travel T R AE1 V AH0 L|treasure T R EH1 ZH ER0|tried T R AY1 D|triumph T R AY1 AH0 M F
tropical T R AA1 P AH0 K AH0 L|trouble T R AH1 B AH0 L|truck T R AH1 K|truly T R UW1 L IY0|truth T R UW1 TH|twelve T W EH1 L V|twenty T W EH1 N T IY0
two T UW1|under AH1 N D ER0|universe Y UW1 N AH0 V ER2 S|unknown AH0 N N OW1 N|until AH0 N T IH1 L|up AH1 P|upgrade AH1 P G R EY2 D|upon AH0 P AA1 N
use Y UW1 Z|useful Y UW1 S F AH0 L|usual Y UW1 ZH UW0 AH0 L|vampire V AE1 M P AY2 ER0|vanish V AE1 N IH0 SH|vehicle V IY1 AH0 K AH0 L
venom V EH1 N AH0 M|very V EH1 R IY0|victim V IH1 K T AH0 M|victory V IH1 K T ER0 IY0|video V IH1 D IY0 OW2|view V Y UW1|village V IH1 L IH0 JH
villain V IH1 L AH0 N|violence V AY1 AH0 L AH0 N S|visit V IH1 Z AH0 T|voice V OY1 S|volume V AA1 L Y UW0 M|voyage V OY1 IH0 JH|walk W AO1 K
wander W AA1 N D ER0|want W AA1 N T|war W AO1 R|warm W AO1 R M|warning W AO1 R N IH0 NG|warrior W AO1 R Y ER0|wash W AA1 SH|watch W AA1 CH
water W AO1 T ER0|we're W IH1 R|wealth W EH1 L TH|weapon W EH1 P AH0 N|wear W EH1 R|weather W EH1 DH ER0|weird W IH1 R D|welcome W EH1 L K AH0 M
well W EH1 L|west W EH1 S T|what W AH1 T|what's W AH1 T S|when W EH1 N|whence W EH1 N S|where W EH1 R|wherefore W EH1 R F AO2 R|which W IH1 CH
while W AY1 L|who HH UW1|whole HH OW1 L|whom HH UW1 M|whose HH UW1 Z|why W AY1|wicked W IH1 K AH0 D|wild W AY1 L D|wind W IH1 N D|window W IH1 N D OW0
wing W IH1 NG|wives W AY1 V Z|wolf W UH1 L F|wolves W UH1 L V Z|woman W UH1 M AH0 N|women W IH1 M AH0 N|won W AH1 N|won't W OW1 N T
wonder W AH1 N D ER0|wood W UH1 D|wool W UH1 L|word W ER1 D|work W ER1 K|world W ER1 L D|worry W ER1 IY0|worse W ER1 S|worship W ER1 SH AH0 P
worst W ER1 S T|worth W ER1 TH|wouldn't W UH1 D AH0 N T|wound W UW1 N D|write R AY1 T|written R IH1 T AH0 N|wrote R OW1 T|year Y IH1 R
yellow Y EH1 L OW0|yes Y EH1 S|yesterday Y EH1 S T ER0 D EY2|yet Y EH1 T|you'll Y UW1 L|you're Y UH1 R|young Y AH1 NG|yourself Y ER0 S EH1 L F
youth Y UW1 TH|zero Z IH1 R OW0|zombie Z AA1 M B IY0
`;

const entriesOf = (text: string): (readonly [string, readonly string[]])[] =>
    text.trim().split(/[|\n]/).map((entry) => {
        const [word, ...sounds] = entry.split(' ');
        return [word!, sounds];
    });

const small = entriesOf(SMALL);

/**
 * The words and their phonemes.
 *
 * @internal
 */
export const WORDS: ReadonlyMap<string, readonly string[]> = new Map([...small, ...entriesOf(OTHERS)]);

/**
 * The small ones.
 *
 * @internal
 */
export const SMALL_WORDS: ReadonlySet<string> = new Set(small.map(([word]) => word));
