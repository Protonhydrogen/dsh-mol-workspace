import { defineTool } from '@deepseek-ai/dsh-tools';
import { ACTIONS, SURFACE_KINDS } from '../shared/model.js';

const residueSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    modelId: { type: 'number', description: 'Model number from current state (usually 1); 0 is a wildcard.' },
    labelAsymId: { type: 'string', description: 'Label (internal) chain id.' },
    authAsymId: { type: 'string', description: 'Auth (PDB) chain id.' },
    labelSeqId: { type: 'number', description: 'Label (internal) residue sequence number.' },
    authSeqId: { type: 'number', description: 'Auth (PDB) residue sequence number.' },
    insCode: { type: 'string', description: 'PDB insertion code, if any.' },
  },
};

function selectionParams() {
  return {
    structureId: { type: 'string', required: true, description: 'structureId of the loaded structure (see molecular_get_state).' },
    kind: { type: 'string', enum: ['residue', 'chain', 'atom', 'none'], description: 'Selection kind (default residue).' },
    chainIds: { type: 'array', items: { type: 'string' }, description: 'Auth chain ids, for kind=chain.' },
    residues: { type: 'array', items: residueSchema, description: 'Residue references carrying auth (PDB) and label numbering.' },
    atoms: { type: 'array', items: {type:'object',additionalProperties:true,properties:{}}, description:'Exact atom references from get_state: include modelId, authAsymId, authSeqId, labelAtomId, altId and unitId when present.' },
  };
}

function selectionFromArgs(args) {
  return {
    structureId: args.structureId,
    kind: args.kind ?? 'residue',
    chainIds: args.chainIds ?? [],
    residues: args.residues ?? [],
    atoms: args.atoms ?? [],
  };
}

const looseObjectSchema = { type: 'object', additionalProperties: true, properties: {} };

function stateSummary(value) {
  return `${value.structures?.length ?? 0} structure(s), selection kind "${value.selection?.kind ?? 'none'}".`;
}

export function registerMolecularTools(ctx, service) {
  ctx.systemPrompt.section({
    name: 'tool:molecular',
    order: 1000,
    text: ({ scope }) =>
      ctx.tools.get('molecular_get_state', scope) === undefined
        ? ''
        : 'The Molecular Workspace tools operate a shared 3D structure viewer. Every selection carries a structureId and distinguishes auth (PDB) numbering from label numbering. Read current state with molecular_get_state before selecting. Mol* Viewer opens automatically for loading and renderer commands; the command waits for its canvas to connect. Keep this conversation visible in DSH. Use molecular_surface for molecular/SES, Gaussian, van der Waals or solvent-accessible surfaces, with color electrostatic and optional residues/radius for a local patch on the full surface. Prefer an existing matching APBS .dx referenced by the user; otherwise call with no dxPath for a labeled approximate protein preview, and report that method. Use molecular_highlight with persistent=true and colorValue for a visible named residue overlay without changing the base style. molecular_control supports exact atom/range selections, styles, tags/layers, six measurements, exports, trajectory and alignment; results are acknowledged by the viewer. Use wait=false for video or long exports, then molecular_get_command to poll. Never report a pending command as complete.',
  });

  try {
    ctx.tools.register(defineTool({
      name: 'molecular_load',
      description: 'Load a local PDB/mmCIF file or a four-character PDB ID into Mol* Viewer. The path is resolved against the session workspace.',
      parameters: {
        path: { type: 'string', required: true, description: 'Path to a .pdb or .cif/.mmcif structure file, or a four-character PDB ID.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            structureId: { type: 'string', required: true },
            title: { type: 'string', required: true },
            format: { type: 'string', required: true },
            byteLength: { type: 'number', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: `Loaded structure "${value.title}" (structureId=${value.structureId}, format=${value.format}, ${value.byteLength} bytes).` }],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const {structureId,title,format,byteLength}=await service.load(exec.agent.session.id,args.path,exec.signal);
        return {structureId,title,format,byteLength};
      },
    }));
    console.info('[molecular] tool registered: molecular_load');
  } catch (err) {
    console.error('[molecular] tool registration failed: molecular_load', err);
  }

  try {
    ctx.tools.register(defineTool({
      name: 'molecular_get_state',
      description: 'Return the current Molecular Workspace state: loaded structures and the current selection, focus, and highlight. Optionally apply a display change (representation preset and/or colour theme) before the state is returned.',
      // defineTool expects a property map; it supplies the root object schema.
      parameters: {
        structureId: { type: 'string', description: 'Target structure id; defaults to the active loaded structure.' },
        representation: { type: 'string', description: 'Optional. Representation preset to apply: auto, polymer-cartoon, atomic-detail, polymer-and-ligand, molecular-surface, illustrative.' },
        color: { type: 'string', description: 'Optional. Colour theme to apply: chain-id, element-symbol, residue-name, secondary-structure, uniform.' },
      },
      output: {
        schema: looseObjectSchema,
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const sessionId = exec.agent.session.id;
        if (args && (args.representation != null || args.color != null)) {
          const state = await service.getState(sessionId);
          const structureId = args.structureId ?? state?.activeStructureId ?? state?.structures?.[0]?.structureId;
          if (structureId == null) throw new Error('molecular_get_state: no structure is loaded');
          await service.setDisplay(sessionId, String(structureId), { representation: args.representation, color: args.color });
        }
        return service.getState(sessionId);
      },
    }));
    console.info('[molecular] tool registered: molecular_get_state');
  } catch (err) {
    console.error('[molecular] tool registration failed: molecular_get_state', err);
  }

  try {
    ctx.tools.register(defineTool({
      name: 'molecular_select',
      description: 'Set the current selection (residues / chains) in the Molecular Workspace viewer.',
      parameters: selectionParams(),
      output: {
        schema: looseObjectSchema,
        render: (_args, value) => [{ type: 'text', text: `molecular_select: ${stateSummary(value)}` }],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return service.select(exec.agent.session.id, selectionFromArgs(args));
      },
    }));
    console.info('[molecular] tool registered: molecular_select');
  } catch (err) {
    console.error('[molecular] tool registration failed: molecular_select', err);
  }

  try {
    ctx.tools.register(defineTool({
      name: 'molecular_focus',
      description: 'Focus (zoom-to) a selection in the Molecular Workspace viewer.',
      parameters: selectionParams(),
      output: {
        schema: looseObjectSchema,
        render: (_args, value) => [{ type: 'text', text: `molecular_focus: ${stateSummary(value)}` }],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return service.focus(exec.agent.session.id, selectionFromArgs(args));
      },
    }));
    console.info('[molecular] tool registered: molecular_focus');
  } catch (err) {
    console.error('[molecular] tool registration failed: molecular_focus', err);
  }

  try {
    ctx.tools.register(defineTool({
      name: 'molecular_highlight',
      description: 'Highlight exact residue sites. Use persistent=true with residues to add a colored ball-and-stick overlay; it survives focus or selection changes. Without persistent options this is the temporary Mol* highlight.',
      parameters: {
        ...selectionParams(),
        persistent:{type:'boolean',description:'Create a named, persistent site overlay when true.'},
        colorValue:{type:'string',description:'Persistent overlay color as #RRGGBB, defaults to gold.'},
        name:{type:'string',description:'Optional permanent site overlay label.'},
      },
      output: {
        schema: looseObjectSchema,
        render: (_args, value) => [{ type: 'text', text: value.status ? JSON.stringify(value,null,2) : `molecular_highlight: ${stateSummary(value)}` }],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const selection=selectionFromArgs(args);
        if(!args.persistent&&!args.colorValue&&!args.name)return service.highlight(exec.agent.session.id,selection);
        const result=await service.executeCommand(exec.agent.session.id,{
          action:'createLayer',args:{selection,exactSite:true,name:args.name??'Highlighted site',
            colorValue:args.colorValue??'#ffc044',representation:'ball-and-stick'}
        },exec.signal);
        return {status:'succeeded',result};
      },
    }));
    console.info('[molecular] tool registered: molecular_highlight');
  } catch (err) {
    console.error('[molecular] tool registration failed: molecular_highlight', err);
  }

  try {
    ctx.tools.register(defineTool({
      name:'molecular_control',
      description:'Execute a Molecular Workspace operation in the live sidebar and return its actual result. args is an action-specific JSON object. Targets: structureId plus chainId/start/end/atomName, or selection from current state. Measurement: {type:"distance", points:[{structureId:"1",chainId:"A",start:10,atomName:"CA"},{structureId:"1",chainId:"A",start:20,atomName:"CA"}]}. Display: {structureId:"1",representation:"ball-and-stick",color:"element-symbol",opacity:1}. getSequence/getStructureInfo inspect parsed data. Tags/layers use name,colorValue and target; deletion uses id. Export: width,height,format,path (relative to workspace); trajectory: mode frame/play/pause/step and frame/fps; align: referenceId,mobileId,referenceChain,mobileChain. The sidebar opens automatically. Use wait=false for long operations, then poll molecular_get_command.',
      parameters:{action:{type:'string',enum:ACTIONS,required:true},args:{type:'json',description:'Action-specific JSON object; defaults to {}.'},commandId:{type:'string',description:'Optional idempotency key; reuse only for the same request.'},wait:{type:'boolean',description:'Default true. false returns a queued command; poll molecular_get_command.'}},
      output:{schema:looseObjectSchema,render:(_args,value)=>[{type:'text',text:JSON.stringify(value,null,2)}]},
      isConcurrencySafe:()=>false,
      async execute(args,exec){
        const input={action:args.action,args:args.args??{},...(args.commandId?{id:args.commandId}:{})};
        if(args.wait===false)return service.enqueueCommand(exec.agent.session.id,input);
        const result=await service.executeCommand(exec.agent.session.id,input,exec.signal);return {status:'succeeded',result};
      },
    }));
    console.info('[molecular] tool registered: molecular_control');
  } catch(err){console.error('[molecular] tool registration failed: molecular_control',err);}
  try {
    // Typed alternative to molecular_control for appearance work: structured
    // parameters are never stringified by the transport, so opacity/colorValue
    // always arrive intact.
    ctx.tools.register(defineTool({
      name:'molecular_style',
      description:'Restyle a structure or paint a coloured selection overlay. Structured alternative to molecular_control setDisplay/createLayer: pass structureId plus representation/color/colorValue/opacity, and optionally residues + name to create a coloured layer over those residues.',
      parameters:{
        structureId:{type:'string',required:true,description:'structureId to restyle.'},
        representation:{type:'string',description:'Representation preset, e.g. molecular-surface, gaussian-surface, ball-and-stick, cartoon.'},
        color:{type:'string',description:'Colour theme (chain-id, element-symbol, residue-name, secondary-structure, uniform).'},
        colorValue:{type:'string',description:'#RRGGBB uniform colour (used for layers and for color="uniform").'},
        opacity:{type:'number',description:'0-1; below 1 gives a transparent surface.'},
        residues:{type:'array',items:residueSchema,description:'Optional residue list; when present a coloured layer is created over these residues.'},
        name:{type:'string',description:'Layer name when residues are given.'},
      },
      output:{schema:looseObjectSchema,render:(_args,value)=>[{type:'text',text:JSON.stringify(value,null,2)}]},
      isConcurrencySafe:()=>false,
      async execute(args,exec){
        const sid=String(args.structureId);
        const style={};for(const k of ['representation','color','colorValue','opacity'])if(args[k]!=null)style[k]=args[k];
        const useLayer=Array.isArray(args.residues)&&args.residues.length>0;
        const input=useLayer
          ?{action:'createLayer',args:{selection:{structureId:sid,kind:'residue',residues:args.residues},name:args.name??`Layer ${sid}`,...style}}
          :{action:'setDisplay',args:{structureId:sid,...style}};
        const result=await service.executeCommand(exec.agent.session.id,input,exec.signal);
        return {status:'succeeded',result};
      },
    }));
    console.info('[molecular] tool registered: molecular_style');
  } catch(err){console.error('[molecular] tool registration failed: molecular_style',err);}
  try {
    ctx.tools.register(defineTool({
      name:'molecular_surface',
      description:'Render a surface layer in Mol* Viewer. Use color=electrostatic for a red/white/blue potential map. Supply a matching APBS .dx path for quantitative map values; without it the viewer computes and labels an approximate protein side-chain preview. Optional residue references and radius color only the nearby patch of the full surface while retaining the whole-structure field. Use removeLayer with the returned layerId to remove it.',
      parameters:{
        structureId:{type:'string',description:'Loaded structure ID; defaults to the active structure.'},
        surface:{type:'string',enum:SURFACE_KINDS,description:'Surface geometry, default molecular (solvent-excluded).'},
        color:{type:'string',enum:['electrostatic','hydrophobicity','chain-id','residue-name','element-symbol','uniform'],description:'Surface coloring. Explicitly use electrostatic for potential.'},
        colorValue:{type:'string',description:'Optional #RRGGBB when color is uniform.'},
        dxPath:{type:'string',description:'Optional local .dx potential map, resolved in the session workspace. Use the loaded original model coordinate frame.'},
        residues:{type:'array',items:residueSchema,description:'Optional exact site residues. Use auth chain and auth sequence ID, or label chain and label sequence ID. Include insertion code if present.'},
        radius:{type:'number',description:'Site radius in Å measured from any selected heavy atom, 1–30, default 6.'},
        limit:{type:'number',description:'Positive symmetric scale limit. Defaults to 5 kT/e for APBS and 0.25 in approximate preview units.'},
        opacity:{type:'number',description:'Layer opacity 0–1, default 0.94.'},
        name:{type:'string',description:'Optional layer name.'},
      },
      output:{schema:looseObjectSchema,render:(_args,value)=>[{type:'text',text:JSON.stringify(value,null,2)}]},
      isConcurrencySafe:()=>false,
      async execute(args,exec){
        const result=await service.executeCommand(exec.agent.session.id,{action:'renderSurface',args},exec.signal);
        return {status:'succeeded',result};
      },
    }));
    console.info('[molecular] tool registered: molecular_surface');
  } catch(err){console.error('[molecular] tool registration failed: molecular_surface',err);}
  try {
    ctx.tools.register(defineTool({
      name:'molecular_get_command',description:'Read a queued Molecular Workspace command. succeeded has result; failed/timed_out/cancelled has error; pending/running is still incomplete.',
      parameters:{commandId:{type:'string',required:true}},
      output:{schema:looseObjectSchema,render:(_args,value)=>[{type:'text',text:JSON.stringify(value,null,2)}]},isConcurrencySafe:()=>true,
      execute:(args,exec)=>service.getCommand(exec.agent.session.id,args.commandId),
    }));
    console.info('[molecular] tool registered: molecular_get_command');
  } catch(err){console.error('[molecular] tool registration failed: molecular_get_command',err);}
}
