/* RX050 fake-only: enable production print formatter in an isolated fake page.
   Never open print dialogs, read patient data, use storage or network. */
window.renderPatientMedications=function(){};
window.medRows=function(fakePatient){return fakePatient.medications||[];};
