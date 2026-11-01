'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../firmware/releases/CampoDoGado_ESP32_V12_Bancada_Reles.ino'),'utf8');
test('R4 executa o transporte real do sketch: reuso TLS, drenagem do corpo e reconexão após erro',t=>{
 const compiler=spawnSync('g++',['--version'],{encoding:'utf8'});if(compiler.error?.code==='ENOENT')return t.skip('g++ indisponível');
 const core=source.split('// ===== cad_transport.h =====')[1]?.split('// ===== cad_transport_end =====')[0];assert.ok(core);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cgd-r4-transport-'));
 try{
 const mock=`#include <cassert>
#include <string>
#include <stdint.h>
using String=std::string;
static int tlsInstances=0,httpInstances=0,connections=0,drains=0,responseCode=200;
static bool beginAllowed=true,partialBody=false;
const char* CERTIFICADOS_CAD="TEST_CA";
const char* CAD_BASE="https://example.test/device";
uint32_t ultimoRttCAD=0;
uint32_t millis(){static uint32_t now=0;return now+=42;}
class WiFiClientSecure {
 public:bool connected=false;WiFiClientSecure(){++tlsInstances;}
 void setCACert(const char* ca){assert(String(ca)=="TEST_CA");}
 void setTimeout(int n){assert(n==3000);}void setHandshakeTimeout(int n){assert(n==3);}void stop(){connected=false;}
};
class HTTPClient {
 WiFiClientSecure* client=nullptr;bool reuse=false,unread=false;
 public:HTTPClient(){++httpInstances;}
 void setReuse(bool on){reuse=on;}
 bool begin(WiFiClientSecure& c,const String& url){client=&c;assert(url.find("https://")==0);return beginAllowed;}
 void setConnectTimeout(int n){assert(n==3000);}void setTimeout(int n){assert(n==3000);}
 void addHeader(const char*,const String&){}
 int POST(const String&){assert(!unread);if(!client->connected){client->connected=true;++connections;}unread=responseCode>0;return responseCode;}
 int getSize(){return partialBody?9:8;}
 String getString(){assert(unread);unread=false;++drains;return "response";}
 void end(){assert(!unread);if(!reuse)client->stop();}
};
`;
 const main=`int main(){
 String result;
 assert(fazerPostCAD("/sinaleiro-bancada","TOKEN-A","{}",&result)==200);assert(result=="response");
 assert(fazerPostCAD("/estado","TOKEN-B","{}")==200);
 assert(tlsInstances==1&&httpInstances==1&&connections==1&&drains==2);assert(ultimoRttCAD==42);
 responseCode=500;assert(fazerPostCAD("/estado","TOKEN-B","{}")==500);assert(drains==3);
 responseCode=200;assert(fazerPostCAD("/sinaleiro-bancada","TOKEN-B","{}",&result)==200);assert(connections==2);
 beginAllowed=false;assert(fazerPostCAD("/estado","TOKEN-B","{}")==-10);
 beginAllowed=true;assert(fazerPostCAD("/estado","TOKEN-B","{}")==200);assert(connections==3);
 responseCode=-1;assert(fazerPostCAD("/estado","TOKEN-B","{}")==-1);
 responseCode=200;assert(fazerPostCAD("/estado","TOKEN-B","{}")==200);assert(connections==4);
 partialBody=true;assert(fazerPostCAD("/estado","TOKEN-B","{}")==-11);
 partialBody=false;assert(fazerPostCAD("/estado","TOKEN-B","{}")==200);assert(connections==5);
}`;
 const cpp=path.join(directory,'transport.cpp'),binary=path.join(directory,process.platform==='win32'?'transport.exe':'transport');
 fs.writeFileSync(cpp,mock+core+main);
 const build=spawnSync('g++',['-std=c++11','-Wall','-Wextra','-Werror',cpp,'-o',binary],{encoding:'utf8'});assert.equal(build.status,0,build.stderr);
 const run=spawnSync(binary,[],{encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(run.status,0,run.stderr||run.stdout);
 }finally{fs.rmSync(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
test('R4 consulta a cada 250 ms, confirma telemetria no mesmo poll e desconta viagem da validade',()=>{
 assert.match(source,/CAD_POLL_MS=250, CAD_REPORT_MS=2000/);
 assert.match(source,/if\(reportDue\)request\+=String\(",\\"estado\\":/);
 assert.match(source,/if\(!reportDue\|\|reportAck\)continue/);
 assert.match(source,/command\.validity-requestElapsed/);
 assert.match(source,/requestElapsed>=command\.validity/);
 assert.match(source,/WiFi\.setSleep\(false\)/);
 assert.match(source,/\},250\);setInterval\(pollCad,3000\)/);
});
