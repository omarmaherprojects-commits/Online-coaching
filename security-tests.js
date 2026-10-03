const base='http://localhost:8080';
async function test(name,fn){try{const ok=await fn();console.log(`${ok?'PASS':'FAIL'}  ${name}`);if(!ok)process.exitCode=1}catch(e){console.log(`FAIL  ${name}: ${e.message}`);process.exitCode=1}}
(async()=>{
 await test('Security headers',async()=>{const r=await fetch(base);return r.headers.get('x-frame-options')==='DENY'&&r.headers.get('x-content-type-options')==='nosniff'&&Boolean(r.headers.get('content-security-policy'))});
 await test('Admin reviews require authentication',async()=>(await fetch(base+'/api/admin/reviews')).status===401);
 await test('Dashboard requires authentication',async()=>(await fetch(base+'/api/admin/dashboard')).status===401);
 await test('Client sessions require valid access',async()=>[401,403].includes((await fetch(base+'/api/client/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'invalid',pin:'0000',dayIndex:0})})).status));
 await test('Reject invalid review',async()=>[422,429].includes((await fetch(base+'/api/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'x',text:'y'})})).status));
 await test('Reject oversized payload',async()=>[400,413,429].includes((await fetch(base+'/api/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'a'.repeat(13000),text:'valid review'})})).status));
 await test('Reject wrong password',async()=>[401,429].includes((await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'wrong-password'})})).status));
 await test('Block server source disclosure',async()=>[403,404].includes((await fetch(base+'/server.js')).status));
 await test('Block platform source disclosure',async()=>[403,404].includes((await fetch(base+'/platform-store.js')).status));
 await test('Block database disclosure',async()=>[403,404].includes((await fetch(base+'/reviews.json')).status));
})();
