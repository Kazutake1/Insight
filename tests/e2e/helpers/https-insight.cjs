const {execFileSync}=require('node:child_process');
const fs=require('node:fs/promises');
const https=require('node:https');
const os=require('node:os');
const path=require('node:path');

const root=path.resolve(__dirname,'../../..');
const contentTypes={'.html':'text/html; charset=utf-8','.js':'application/javascript',
  '.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};

module.exports=async function serveHttpsInsight(use){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'insight-https-fixture-'));
  let server;
  try{
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
      '-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost',
      '-keyout','key.pem','-out','cert.pem'],{cwd:temp,stdio:'ignore'});
    const [key,cert]=await Promise.all([fs.readFile(path.join(temp,'key.pem')),fs.readFile(path.join(temp,'cert.pem'))]);
    server=https.createServer({key,cert},async (request,response)=>{
      const pathname=new URL(request.url,'https://localhost').pathname;
      const asset=/^\/Insight\/((?:draft\/)?[\w.-]+\.(?:html|js|css|json|svg|png))$/.exec(pathname)?.[1];
      if(asset){
        try{
          const body=await fs.readFile(path.join(root,asset));
          response.writeHead(200,{'Content-Type':contentTypes[path.extname(asset)]});
          response.end(body);
          return;
        }catch(error){
          if(error.code!=='ENOENT')throw error;
        }
      }
      response.writeHead(404).end();
    });
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    await use('https://localhost:'+server.address().port+'/Insight');
  }finally{
    if(server?.listening)await new Promise((resolve,reject)=>{
      server.close(error=>error?reject(error):resolve());
      server.closeAllConnections();
    });
    await fs.rm(temp,{recursive:true,force:true});
  }
};
