import {frameCaption} from '../shared/citation-frame.js';
import {contextText} from '../shared/citations.js';
export function insertMolecularCitation(ctx,sessionId,context,label){
 const binding=ctx.get('sessions').binding(sessionId);if(!binding)throw new Error('The conversation is not open');
 const input=ctx.get('conversation').input.for(binding.ctx),span=input.actions.captureInsertion();
 const reference={source:'molecular',ref:JSON.stringify(context),label:label??context.structure?.title??'Molecular context',appearance:'file',clipboardText:contextText(context)};
 const inserted=ctx.get('inputTriggers').sessionOf(binding.ctx).execute({insert:reference},span);
 if(inserted!==true)throw new Error('The conversation input is busy or changed. The molecular context was not inserted; try again.');
 return {ok:true,delivery:'composer',context};
}
export function selectionCitationLabel(context){
 const title=context.structure.title+frameCaption(context);
 const s=context.selection;if(!s)return title;
 const refs=s.kind==='atom'?s.atoms:s.residues;
 if(s.kind==='chain')return `${title} · Chain ${s.chainIds.join(', ')}`;
 if(!refs?.length)return title;
 const a=refs[0],b=refs.at(-1),range=refs.length>1?`${a.authAsymId}:${a.authSeqId}${a.insCode??''}–${b.authSeqId}${b.insCode??''}`:`${a.authAsymId}:${a.authSeqId}${a.insCode??''}`;
 return `${title} · ${range}${s.kind==='atom'?' '+(a.authAtomId??a.labelAtomId):' · '+refs.length+' residues'}`;
}
