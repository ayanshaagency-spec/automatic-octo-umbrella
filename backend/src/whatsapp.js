const crypto=require('crypto');

function configured(){
  return Boolean(process.env.WHATSAPP_PROVIDER_URL&&process.env.WHATSAPP_ACCESS_TOKEN&&process.env.WHATSAPP_PHONE_NUMBER_ID);
}
function status(){
  return {configured:configured(),provider:process.env.WHATSAPP_PROVIDER||'meta-cloud-api',delivery:'unverified-until-provider-responds'};
}
function idempotencyKey(event,to){
  return crypto.createHash('sha256').update(JSON.stringify({event,to})).digest('hex');
}
async function sendWhatsApp({to,text,event}){
  if(!configured()) return {ok:false,status:'credential_required',message:'WhatsApp integration configured — production delivery requires provider credentials.'};
  const key=idempotencyKey(event,to);
  const url=process.env.WHATSAPP_PROVIDER_URL.replace(/\/$/,'')+'/'+process.env.WHATSAPP_PHONE_NUMBER_ID+'/messages';
  try{
    const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+process.env.WHATSAPP_ACCESS_TOKEN,'Content-Type':'application/json','X-Idempotency-Key':key},body:JSON.stringify({messaging_product:'whatsapp',to,type:'text',text:{body:text}})});
    const body=await r.text();
    let data;try{data=JSON.parse(body)}catch{data={raw:body}};
    if(!r.ok)return {ok:false,status:'provider_error',providerStatus:r.status,data};
    return {ok:true,status:'provider_accepted',delivery:'not_confirmed',providerMessageId:data?.messages?.[0]?.id||null,data};
  }catch(error){return {ok:false,status:'transport_error',message:error.message};}
}
module.exports={configured,status,sendWhatsApp};