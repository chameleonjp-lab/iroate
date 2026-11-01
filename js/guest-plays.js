// Count-only queue inspired by Takkeu. Never stores names or scores.
export const GUEST_PENDING_PREFIX = 'iroate.guest-start.v1.';
const validUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function defaultStorage() {try {return globalThis.localStorage;} catch {return null;}}

export function createGuestPlayCounter({storage=defaultStorage(),send,uuid=()=>crypto.randomUUID(),onStatus=()=>{}}) {
  function read() {
    try {
      return Array.from({length:storage?.length??0},(_,i)=>storage.key(i))
        .filter(key=>key?.startsWith(GUEST_PENDING_PREFIX)).map(key=>{
          try {const row=JSON.parse(storage.getItem(key));return key===GUEST_PENDING_PREFIX+row?.startId?row:null;} catch {return null;}
        }).filter(row=>row && validUuid(row.startId) && (row.permanentFailure===undefined || typeof row.permanentFailure==='boolean'));
    } catch {return [];}
  }
  let pending=read(),inFlight=null,followUp=false;
  function persist(row) {try {storage?.setItem(GUEST_PENDING_PREFIX+row.startId,JSON.stringify(row));}catch{/* Keep in memory. */}}
  function forget(id) {try {storage?.removeItem(GUEST_PENDING_PREFIX+id);}catch{/* A lost ACK is deduplicated server-side. */}}
  function retry() {
    if(inFlight)return inFlight;
    for(const row of read()) if(!pending.some(p=>p.startId===row.startId))pending.push(row);
    if(!pending.some(row=>!row.permanentFailure))return Promise.resolve();
    inFlight=(async()=>{
      for(;;) {
        const row=pending.find(p=>!p.permanentFailure);
        if(!row)return;
        try {
          onStatus(row.startId,'counting');
          await send(row.startId);
          pending=pending.filter(p=>p.startId!==row.startId);forget(row.startId);
          onStatus(row.startId,'counted');
        } catch(error) {
          onStatus(row.startId,'pending');
          if(error?.retryable !== false)return;
          row.permanentFailure=true;persist(row);
          onStatus(row.startId,'failed');
        }
      }
    })().finally(()=>{
      inFlight=null;
      if(followUp){followUp=false;return retry();}
    });
    return inFlight;
  }
  return {
    record() {
      let startId;
      try {startId=uuid();} catch {return null;}
      if(!validUuid(startId))return null;
      if(pending.some(row=>row.startId===startId))return null;
      try {if(storage?.getItem(GUEST_PENDING_PREFIX+startId)!=null)return null;}catch{/* Unavailable storage still allows an in-memory anonymous start. */}
      const row={startId};pending.push(row);persist(row);
      onStatus(startId,'pending');
      if(inFlight)followUp=true;
      void retry();
      return startId;
    },
    retry
  };
}
