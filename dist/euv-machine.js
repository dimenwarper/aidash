"use strict";

const EUV_PARTS=[
  {id:"system",name:"EUV scanner",nodes:["asml_veldhoven"]},
  {id:"laser",name:"CO₂ drive laser",nodes:["trumpf_ditzingen"]},
  {id:"source",name:"Tin-plasma light source & collector",nodes:["asml_sandiego"]},
  {id:"optics",name:"Illumination & projection mirrors",nodes:["zeiss_oberkochen","zeiss_wetzlar"]},
  {id:"mask",name:"Reflective mask · fab consumable",nodes:["hoya_singapore"]},
  {id:"pellicle",name:"Pellicle · fab consumable",nodes:["mitsui_iwakuni"]},
  {id:"stage",name:"Wafer clamp & positioning stage",nodes:["asml_berlin"]},
  {id:"vacuum",name:"Vacuum valves · application association",nodes:["vat_haag","vat_penang"]},
  {id:"output",name:"Downstream fab output",nodes:["tsmc_taiwan"]},
];

function euvPartForNode(id) { return EUV_PARTS.find(part=>part.nodes.includes(id)) || EUV_PARTS[1]; }

function euvMachineSVG(selectedNode) {
  const selected=euvPartForNode(selectedNode).id;
  const part=(id,body)=>{
    const definition=EUV_PARTS.find(p=>p.id===id);
    const label=definition.name.replaceAll("&","&amp;");
    return `<g class="machine-part" data-euv-part="${id}" role="button" tabindex="0" aria-pressed="${selected===id}" aria-label="${label}"><title>${label} — select for suppliers and reported activity</title>${body}</g>`;
  };
  return `<svg class="euv-machine" viewBox="0 0 800 610" xmlns="http://www.w3.org/2000/svg" role="group" aria-labelledby="euv-machine-title euv-machine-desc">
    <title id="euv-machine-title">EUV lithography scanner: interactive cutaway</title>
    <desc id="euv-machine-desc">A CO2 laser excites tin plasma. A collector sends EUV light through illumination mirrors to a reflective mask. Light passes through the pellicle, reflects off the mask, passes back through the pellicle, and travels through projection mirrors to the wafer. The EUV path is in vacuum. Select a component for its supplier details. This is a functional schematic, not an exact machine layout or mirror count.</desc>
    <defs>
      <linearGradient id="euv-metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#eef0eb"/><stop offset="1" stop-color="#c4cec5"/></linearGradient>
      <linearGradient id="euv-wafer" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#bcc9c7"/><stop offset=".6" stop-color="#7e999e"/><stop offset="1" stop-color="#ced6ca"/></linearGradient>
      <pattern id="wafer-grid" width="12" height="9" patternUnits="userSpaceOnUse"><path d="M12 0H0V9" fill="none" stroke="#edf0e9" stroke-width=".65"/></pattern>
      <clipPath id="wafer-shape"><ellipse cx="477" cy="438" rx="58" ry="17"/></clipPath>
    </defs>
    <g class="machine-static" aria-hidden="true">
      <ellipse cx="441" cy="528" rx="274" ry="24" fill="#e6e8e1"/>
      <path d="M213 485 611 509 713 452 314 432Z" fill="#c8d0c8" stroke="#8f9b92"/>
      <path d="M213 485V497L611 523V509ZM611 509 713 452V466L611 523" fill="#b2beb3" stroke="#8f9b92"/>
      <path d="M261 495V519L291 521V497M559 514V534L590 535V517" fill="#b5bdb5" stroke="#8f9b92"/>
    </g>
    ${part("system",`
      <path class="part-body machine-enclosure" d="M254 147 350 89 710 110 610 163V510L254 488Z" fill="#edf0e9" fill-opacity=".58"/>
      <path class="part-body" d="M610 163 710 110V454L610 510Z" fill="url(#euv-metal)"/>
      <path class="part-body" d="M254 147 350 89 710 110 610 163Z" fill="#e1e6df"/>
      <path d="M271 157V477M600 174V487M274 477 596 498M279 161 595 179" class="machine-frame"/>
      <path d="M669 158V278M681 151V273M693 144V266" stroke="#bac4bc" fill="none"/>
      <path class="machine-leader" d="M283 125 226 83H85"/>
      <text class="machine-label" x="85" y="57">EUV scanner</text><text class="machine-supplier" x="85" y="78">ASML · system integration</text>
      <text class="machine-note" x="428" y="130" transform="rotate(3 428 130)">Vacuum enclosure</text>
    `)}
    <g class="machine-static" aria-hidden="true">
      <path d="M239 331 277 307 292 319 251 351M239 376 274 354 285 366 251 389" fill="#d3dcd3" stroke="#95a597"/>
      <path d="M245 337 309 282 328 294 256 372Z" fill="#edf0e9" stroke="#bac7bc"/>
      <path d="M487 153V191M505 151V194" stroke="#bdc6bd" stroke-width="6"/>
    </g>
    ${part("laser",`
      <path class="part-body" d="M55 404 94 380 184 388 145 414V461L55 451Z" fill="#d9dfd7"/>
      <path class="part-body" d="M145 414 184 388V433L145 461Z" fill="#bfcbbf"/>
      <path class="part-body" d="M55 404 94 380 184 388 145 414Z" fill="#edf0e9"/>
      <path d="M67 421 125 427M67 428 125 434M67 435 108 440" class="machine-frame"/>
      <circle cx="168" cy="409" r="8" fill="#70837b" stroke="#566b60"/>
      <path d="M169 409 215 365" class="drive-laser"/>
      <path class="machine-leader" d="M97 461V496H58"/>
      <text class="machine-label" x="58" y="520">CO₂ drive laser</text><text class="machine-supplier" x="58" y="541">TRUMPF</text>
    `)}
    ${part("source",`
      <ellipse class="part-body" cx="221" cy="354" rx="55" ry="67" fill="url(#euv-metal)" transform="rotate(-24 221 354)"/>
      <ellipse cx="225" cy="354" rx="42" ry="54" fill="#f3f4ef" stroke="#a8b5a8" transform="rotate(-24 225 354)"/>
      <path d="M199 311Q163 353 207 397" class="collector-mirror"/>
      <path d="M216 295 224 337" stroke="#687f6d" stroke-width="4"/>
      <circle cx="225" cy="345" r="2.5" fill="#778574"/><circle cx="227" cy="353" r="7" fill="#b9a271"/>
      <path d="M215 352H239M227 341V365M218 344 237 362M218 363 237 343" stroke="#b9a271" stroke-width="1.6"/>
      <path d="M227 353 183 345 309 282M227 353 194 382 309 282" class="source-rays"/>
      <path class="machine-leader" d="M195 295 150 269H56"/>
      <text class="machine-label" x="56" y="238">Light source</text><text class="machine-supplier" x="56" y="260">ASML · tin plasma + collector</text>
    `)}
    ${part("optics",`
      <path d="M315 284 393 249 468 196 495 267 427 300 524 332 438 370 492 408" class="optics-hit-area"/>
      <path class="mirror-support" d="M295 292 318 307M384 237 404 226M488 254 505 250M414 290 425 277M523 345 541 339M422 379 438 392M490 395 507 397"/>
      <g class="optical-mirrors">
        <ellipse class="part-body" cx="310" cy="282" rx="23" ry="5" transform="rotate(29 310 282)"/>
        <ellipse class="part-body" cx="395" cy="249" rx="21" ry="5" transform="rotate(-26 395 249)"/>
        <ellipse class="part-body" cx="495" cy="267" rx="24" ry="5" transform="rotate(-8 495 267)"/>
        <ellipse class="part-body" cx="427" cy="300" rx="25" ry="5" transform="rotate(15 427 300)"/>
        <ellipse class="part-body" cx="524" cy="332" rx="25" ry="5" transform="rotate(-13 524 332)"/>
        <ellipse class="part-body" cx="438" cy="370" rx="26" ry="5" transform="rotate(8 438 370)"/>
        <ellipse class="part-body" cx="492" cy="408" rx="21" ry="5" transform="rotate(-10 492 408)"/>
      </g>
      <path class="machine-leader" d="M316 258V197L344 165V91"/>
      <text class="machine-label" x="324" y="55">Mirrors</text><text class="machine-supplier" x="324" y="77">ZEISS · illumination &amp; projection</text>
    `)}
    ${part("mask",`
      <path class="part-body" d="M438 183 489 169 515 184 461 201Z" fill="#637b73"/>
      <path d="M448 184 479 177M454 188 485 180M461 192 493 182" stroke="#b4c4b8" stroke-width="2"/>
      <path class="machine-leader" d="M512 179 555 155H584"/>
      <text class="machine-label" x="582" y="176">Reflective mask</text><text class="machine-supplier" x="582" y="197">HOYA · mask blank</text>
    `)}
    ${part("pellicle",`
      <path class="part-body" d="M436 206 492 196 516 210 460 221Z" fill="#d9e4d7" fill-opacity=".75"/>
      <path d="M440 209 493 200 511 210 460 217Z" fill="#eef1e7" fill-opacity=".65" stroke="#96ac92" stroke-width=".7"/>
      <path class="machine-leader" d="M515 213 552 235H581"/>
      <text class="machine-label" x="581" y="254">Pellicle</text><text class="machine-supplier" x="581" y="275">Mitsui · protective membrane</text>
    `)}
    <path class="euv-beam machine-static" d="M227 353 183 345 310 282 395 249 468 196 495 267 427 300 524 332 438 370 492 408 477 438" aria-hidden="true"/>
    ${part("stage",`
      <path class="part-body" d="M386 448 469 415 567 440 486 478Z" fill="#bccbbf"/>
      <path class="part-body" d="M386 448V463L486 493V478ZM486 478 567 440V457L486 493" fill="#a1b6a7"/>
      <path d="M399 461 472 483M413 452 486 474M498 472 554 447" stroke="#697f70" stroke-width="3"/>
      <ellipse cx="477" cy="442" rx="61" ry="19" fill="#73897d" stroke="#647b6d"/>
      <ellipse class="part-body" cx="477" cy="438" rx="58" ry="17" fill="url(#euv-wafer)"/>
      <rect x="416" y="418" width="124" height="39" fill="url(#wafer-grid)" clip-path="url(#wafer-shape)"/>
      <rect x="471" y="434" width="13" height="6" fill="#dce6db" stroke="#718d7c"/>
      <path class="machine-leader" d="M400 467 357 505V535"/>
      <text class="machine-label" x="292" y="558">Wafer stage</text><text class="machine-supplier" x="292" y="579">ASML Berlin · clamp &amp; positioning</text>
    `)}
    ${part("vacuum",`
      <path d="M603 380 647 358V451M646 372 676 353M646 407 676 388M646 438 676 419" stroke="#84998a" stroke-width="10" fill="none"/>
      <path class="part-body" d="M632 380 649 370 664 380V410L647 420 632 410Z" fill="#c5d3c5"/>
      <ellipse class="part-body" cx="648" cy="389" rx="12" ry="15" fill="#9caf9e"/>
      <path d="M648 378V401M639 389H657" stroke="#5e7967" stroke-width="2"/>
      <path class="machine-leader" d="M664 383 709 368V329"/>
      <text class="machine-label" x="605" y="309">Vacuum valves</text><text class="machine-supplier" x="605" y="331">VAT · application association</text>
    `)}
    ${part("output",`
      <path d="M579 477 640 510" stroke="#94a28f" stroke-width="1.3" stroke-dasharray="4 5" fill="none"/>
      <path class="part-body" d="M631 518 673 491 730 506 690 532Z" fill="#cbd4c8"/>
      <g fill="url(#euv-wafer)" stroke="#8a9e91"><ellipse class="part-body" cx="683" cy="514" rx="38" ry="12"/><ellipse class="part-body" cx="683" cy="508" rx="38" ry="12"/><ellipse class="part-body" cx="683" cy="502" rx="38" ry="12"/></g>
      <text class="machine-label" x="613" y="557">Fab output</text><text class="machine-supplier" x="613" y="579">TSMC · downstream</text>
    `)}
    <g class="machine-static" aria-hidden="true"><path d="M59 592H94" class="euv-beam"/><text class="machine-note" x="105" y="597">13.5 nm EUV light</text></g>
  </svg>`;
}
