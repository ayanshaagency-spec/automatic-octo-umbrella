const test=require('node:test');
const assert=require('node:assert/strict');
const {sendWhatsApp}=require('./whatsapp');

const saved={url:process.env.WHATSAPP_PROVIDER_URL,token:process.env.WHATSAPP_ACCESS_TOKEN,id:process.env.WHATSAPP_PHONE_NUMBER_ID,fetch:global.fetch};
function setup(){process.env.WHATSAPP_PROVIDER_URL='https://example.invalid';process.env.WHATSAPP_ACCESS_TOKEN='test-only';process.env.WHATSAPP_PHONE_NUMBER_ID='test-id';}
test('provider error response does not expose provider payload',async()=>{
 setup();global.fetch=async()=>({ok:false,status:400,text:async()=>JSON.stringify({secret:'sensitive',message:'raw provider details'})});
 const r=await sendWhatsApp({to:'123',text:'test',event:'test'});
 assert.equal(r.status,'provider_error');assert.equal(r.providerStatus,400);assert.equal(JSON.stringify(r).includes('sensitive'),false);assert.equal(JSON.stringify(r).includes('raw provider details'),false);
});
test('transport error response does not expose exception details',async()=>{
 setup();global.fetch=async()=>{throw new Error('sensitive connection diagnostic');};
 const r=await sendWhatsApp({to:'123',text:'test',event:'test'});
 assert.equal(r.status,'transport_error');assert.equal(JSON.stringify(r).includes('sensitive connection diagnostic'),false);
});
test('success response exposes only message ID, not provider body',async()=>{
 setup();global.fetch=async()=>({ok:true,status:200,text:async()=>JSON.stringify({messages:[{id:'message-id'}],secret:'hidden'})});
 const r=await sendWhatsApp({to:'123',text:'test',event:'test'});
 assert.equal(r.providerMessageId,'message-id');assert.equal(JSON.stringify(r).includes('hidden'),false);
});
test.after(()=>{if(saved.url===undefined)delete process.env.WHATSAPP_PROVIDER_URL;else process.env.WHATSAPP_PROVIDER_URL=saved.url;if(saved.token===undefined)delete process.env.WHATSAPP_ACCESS_TOKEN;else process.env.WHATSAPP_ACCESS_TOKEN=saved.token;if(saved.id===undefined)delete process.env.WHATSAPP_PHONE_NUMBER_ID;else process.env.WHATSAPP_PHONE_NUMBER_ID=saved.id;global.fetch=saved.fetch;});
