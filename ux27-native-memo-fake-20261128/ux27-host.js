/* UX27 production bridge: no test PIN; reuse existing encrypted state. */
(function(){
 'use strict';
 if(window.__MSW_UX27_HOST__ || typeof openPatient!=='function' ||
    typeof activePatients!=='function' || typeof flushPatientAutoSave!=='function' ||
    typeof save!=='function')return;
 window.__MSW_UX27_HOST__=true;
 window.UX27Host=Object.freeze({
  getPatient:()=>selectedPatient, activePatients:()=>activePatients(),
  openPatient:patient=>openPatient(patient),unlocked:()=>Boolean(key&&state),
  uid:()=>uid(), save:()=>save(), flushPatient:()=>flushPatientAutoSave(),
  beginNote:()=>{
   if(noteWriteBusy||maintenanceAction||resetInProgress||!key||!state||!selectedPatient)return false;
   noteWriteBusy=true;return true;
  },
  endNote:()=>{noteWriteBusy=false;}
 });
})();
