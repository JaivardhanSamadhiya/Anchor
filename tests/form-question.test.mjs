import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result = await build({entryPoints:['src/domain/form-question.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {resolveFormQuestion} = await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const contact = {formId:'cf37',sectionId:'identity',fieldId:'mailingStreet',help:'meaning'};
test('a street-only city request asks for missing location information without a lookup or invented city',()=>{
  const reply = resolveFormQuestion('I live at 123 Fictional Street, what is my city?',contact,'en');
  assert.equal(reply.kind,'local'); assert.match(reply.answer,/ZIP code and state/);
  assert.doesNotMatch(reply.answer,/123|Fictional|San Jose|recertification/i);
  assert.equal(reply.citations[0].url,'https://tools.usps.com/go/ZipLookup.htm');
});
test('a supplied ZIP produces only a postal lookup identifier, never the full private message',()=>{
  const reply = resolveFormQuestion('What city is my address in? The ZIP is 00000.',contact,'en');
  assert.deepEqual(reply,{kind:'postal-lookup',zip:'00000'});
});
test('city follow-ups accept only explicit or bare ZIP codes and preserve leading zeroes',()=>{
  assert.deepEqual(resolveFormQuestion('My zipcode is 95124, I am not sure about the mailing city.',contact,'en',true),{kind:'postal-lookup',zip:'95124'});
  assert.deepEqual(resolveFormQuestion('02108',contact,'en',true),{kind:'postal-lookup',zip:'02108'});
  assert.deepEqual(resolveFormQuestion('95124-1234',contact,'en',true),{kind:'postal-lookup',zip:'95124'});
  assert.notEqual(resolveFormQuestion('My case number is 12345.',contact,'en',true).kind,'postal-lookup');
  assert.notEqual(resolveFormQuestion('I live at 12345 Fictional Road, what is my city?',contact,'en').kind,'postal-lookup');
  assert.notEqual(resolveFormQuestion('Should I use ZIP 95124 or 95008?',contact,'en',true).kind,'postal-lookup');
});
test('public city meaning is a relevant mailing-city explanation rather than a location request',()=>{
  const reply = resolveFormQuestion('What does city mean in this form?',contact,'en');
  assert.equal(reply.kind,'request');assert.equal(reply.context.fieldId,'mailingCity');
});
test('gross-versus-net meaning routes to the correct reviewed income field from an unrelated selection',()=>{
  const reply = resolveFormQuestion('Is gross income before or after taxes?',contact,'en');
  assert.equal(reply.kind,'request');assert.deepEqual(reply.context,{formId:'cf37',sectionId:'income',fieldId:'job1Gross',help:'meaning'});
});
test('SAR7 reporting period routes to its own field without private text',()=>{
  const reply = resolveFormQuestion('What is the report month? My PRIVATE_QUESTION_SENTINEL notice says September.',{formId:'sar7b',sectionId:'expenses',help:'meaning'},'en');
  assert.equal(reply.kind,'request');assert.equal(reply.context.fieldId,'reportMonth');assert.doesNotMatch(JSON.stringify(reply),/PRIVATE|September/);
  assert.equal(resolveFormQuestion('What is the report month?',contact,'en').kind,'local');
});
test('unrelated and personal yes/no decisions request clarification instead of an irrelevant AI response',()=>{
  for(const question of ['Who won the football game?','Should I answer yes because my roommate moved?'])assert.equal(resolveFormQuestion(question,contact,'en').kind,'local');
});
test('Spanish address and income questions preserve the same private boundary',()=>{
  const address=resolveFormQuestion('Vivo en 123 Calle Ficticia, ¿cuál es mi ciudad?',contact,'es');
  assert.equal(address.kind,'local');assert.match(address.answer,/código postal y estado/);assert.doesNotMatch(address.answer,/123|Ficticia/);
  const income=resolveFormQuestion('¿El ingreso bruto es antes de impuestos?',contact,'es');assert.equal(income.kind,'request');assert.equal(income.context.sectionId,'income');
});
test('public ZIP and state definitions target their own fields',()=>{
  assert.equal(resolveFormQuestion('What does ZIP mean on this form?',contact,'en').context.fieldId,'mailingZip');
  assert.equal(resolveFormQuestion('What does state mean on this form?',contact,'en').context.fieldId,'mailingState');
});
test('numbered questions and explicit unrelated subjects cannot silently inherit a mailing field',()=>{
  const numbered=resolveFormQuestion('How do I answer question 12?',contact,'en');
  assert.equal(numbered.kind,'request');assert.equal(numbered.context.fieldId,'q12');
  for(const question of ['What does this eviction notice mean?','How do I answer the question about a traffic ticket?'])assert.equal(resolveFormQuestion(question,contact,'en').kind,'local');
  assert.equal(resolveFormQuestion('How do I answer this question?',contact,'en').context.fieldId,'mailingStreet');
});
test('property taxes are housing expenses rather than gross wages',()=>{
  const reply=resolveFormQuestion('How do I report my property taxes?',contact,'en');
  assert.equal(reply.kind,'request');assert.equal(reply.context.sectionId,'housing');assert.equal(reply.context.fieldId,'propertyCosts');
});
test('a proposed mailing city without a ZIP still asks for the missing ZIP',()=>{
  const reply=resolveFormQuestion('I live at 123 Fictional Street. Is San Jose my mailing city?',contact,'en');
  assert.equal(reply.kind,'local');assert.equal(reply.awaitingPostalCity,true);assert.match(reply.answer,/ZIP code and state/);
});
