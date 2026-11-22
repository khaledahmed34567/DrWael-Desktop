'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'),dirs=['','app','scripts','tests'];
let count=0;
for(const dir of dirs)for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
 if(!entry.isFile()||!entry.name.endsWith('.js'))continue;
 const file=path.join(root,dir,entry.name),check=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
 if(check.status!==0){process.stderr.write(check.stderr||check.stdout||'Syntax check failed\n');process.exit(1)}count++;
}
for(const file of ['app/index.html','desktop-widget.html','store-gate.html','dialog.html','hello-gate.html']){
 const html=fs.readFileSync(path.join(root,file),'utf8');
 for(const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(match[1],{filename:file});
}
console.log(`Lint OK: ${count} JavaScript files plus inline app/widget/Store-gate scripts`);
