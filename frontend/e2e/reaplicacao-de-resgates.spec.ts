import {test,expect} from '@playwright/test';
import {entrar,irPara,focarPeloTeclado} from './apoio';

test('vincular resgate histórico e desfazer restaura a meta e o foco',async({page})=>{
 test.setTimeout(60000);
 await entrar(page);await page.clock.setFixedTime(new Date(2026,10,10,12));
 await page.evaluate(async()=>{
  const caminho='/src/simulacao/manipuladores.ts';
  (await import(/* @vite-ignore */caminho) as typeof import('../src/simulacao/manipuladores')).prepararCenarioDeReaplicacao();
  const cache='/src/api/useConsulta.ts';
  (await import(/* @vite-ignore */cache) as typeof import('../src/api/useConsulta')).invalidar('');
 });
 const conferirMeta=async(valor:string)=>{
  await irPara(page,'Orçamento');
  await expect(page.getByRole('img',{name:/^Liberdade financeira: /})).toHaveAttribute('aria-label',new RegExp(valor));
 };
 const movimentos=async()=>{await irPara(page,'Transações');await page.getByRole('button',{name:'Aportes e resgates',exact:true}).click();};
 await conferirMeta('150,00');await movimentos();
 const vincular=page.getByRole('button',{name:'Vincular resgate: Aporte fictício'});
 await focarPeloTeclado(page,vincular);await vincular.click();
 let dialogo=page.getByRole('dialog',{name:'Vincular resgate ao aporte'});
 await expect(dialogo.getByRole('radio',{name:/Resgate fictício/})).not.toBeChecked();
 await expect(dialogo.getByRole('button',{name:'Confirmar reaplicação'})).toBeDisabled();
 await dialogo.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(vincular).toBeFocused();
 await vincular.click();dialogo=page.getByRole('dialog',{name:'Vincular resgate ao aporte'});
 await dialogo.getByRole('radio',{name:/Resgate fictício/}).check();
 await expect(dialogo.getByLabel('Valor reaplicado')).toHaveValue('100,00');
 await expect(dialogo).toContainText('31/10/2026');
 await dialogo.getByRole('button',{name:'Confirmar reaplicação'}).click();
 const desfazer=page.getByRole('button',{name:'Desfazer reaplicação: Aporte fictício'});
 await expect(desfazer).toBeFocused();await conferirMeta('50,00');await movimentos();
 await desfazer.click();const confirmacao=page.getByRole('dialog',{name:'Desfazer reaplicação?'});
 await expect(confirmacao.getByRole('button',{name:'Cancelar',exact:true})).toBeFocused();
 await confirmacao.getByRole('button',{name:'Confirmar remoção da reaplicação'}).click();
 await expect(vincular).toBeFocused();await conferirMeta('150,00');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
