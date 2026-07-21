<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

const CACHE_DIR=__DIR__.'/cache_gaia';
const CACHE_MAX_SIZE=500*1024*1024;
const CACHE_TTL=30*24*3600;
const TIMEOUT=20;

if(!is_dir(CACHE_DIR)) mkdir(CACHE_DIR,0777,true);

$ra=$_GET['ra']??null;
$dec=$_GET['dec']??null;
$rad=$_GET['rad']??null;
$mag=$_GET['mag']??16;

if(!is_numeric($ra)||!is_numeric($dec)||!is_numeric($rad)||!is_numeric($mag)){
 http_response_code(400);
 exit(json_encode(['error'=>'Parámetros incorrectos']));
}

$key=md5(sprintf('%.5f_%.5f_%.5f_%.2f',$ra,$dec,$rad,$mag));
$file=CACHE_DIR."/$key.json";

if(is_file($file)){
 if(time()-filemtime($file)<CACHE_TTL){
   touch($file);
   readfile($file);
   exit;
 }
 unlink($file);
}

$queries=[];

$q='SELECT TOP 40000 RA_ICRS, DE_ICRS, Gmag, "BP-RP" FROM "I/355/gaiadr3" WHERE Gmag<='.$mag.
' AND 1=CONTAINS(POINT(\'ICRS\',RA_ICRS,DE_ICRS), CIRCLE(\'ICRS\','.$ra.','.$dec.','.$rad.')) ORDER BY Gmag';
$queries[]='https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync?request=doQuery&lang=adql&format=json&query='.rawurlencode($q);

$q='SELECT TOP 40000 ra,dec,phot_g_mean_mag,phot_bp_mean_mag-phot_rp_mean_mag AS bprp FROM gaia.dr3lite WHERE phot_g_mean_mag<='.$mag.
' AND 1=CONTAINS(POINT(\'ICRS\',ra,dec), CIRCLE(\'ICRS\','.$ra.','.$dec.','.$rad.')) ORDER BY phot_g_mean_mag';
$queries[]='https://dc.zah.uni-heidelberg.de/tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY='.rawurlencode($q);

$json=null;
foreach($queries as $url){
 $ch=curl_init($url);
 curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>8,CURLOPT_TIMEOUT=>TIMEOUT]);
 $body=curl_exec($ch);
 $http=curl_getinfo($ch,CURLINFO_HTTP_CODE);
 curl_close($ch);
 if($http>=200&&$http<300&&$body!==false){$json=$body;break;}
}
if($json===null){
 http_response_code(502);
 exit(json_encode(['error'=>'No hay respuesta de Gaia']));
}
file_put_contents($file,$json);

$files=glob(CACHE_DIR.'/*.json');
$total=0;$list=[];
foreach($files as $f){$s=filesize($f);$total+=$s;$list[]=[$f,$s,filemtime($f)];}
if($total>CACHE_MAX_SIZE){
 usort($list,fn($a,$b)=>$a[2]<=>$b[2]);
 foreach($list as $e){
   @unlink($e[0]);$total-=$e[1];
   if($total<=CACHE_MAX_SIZE)break;
 }
}
echo $json;
