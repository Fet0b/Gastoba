import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { chamar } from '../../api/cliente';
import type { MovimentoDeInvestimento, Investimento } from '../../api/tipos';
import { prepararCenarioDeReaplicacao } from '../../simulacao/manipuladores';
import { MovimentosDeInvestimento } from './MovimentosDeInvestimento';

it('confirma resgate de outro mês e desfaz preservando os movimentos', async () => {
  const {aporteId} = prepararCenarioDeReaplicacao();
  const parametros={inicio:'2026-11-01',fim:'2026-11-30'};
  const movimentos = await chamar<MovimentoDeInvestimento[]>('/movimentos-de-investimento', {parametros});
  const investimentos = await chamar<Investimento[]>('/investimentos');
  render(<MovimentosDeInvestimento movimentos={movimentos} investimentos={investimentos} aoAvisar={()=>{}} aoFalhar={()=>{}}/>);
  fireEvent.click(await screen.findByRole('button', {name:'Vincular resgate: Aporte fictício'}));
  const dialogo = await screen.findByRole('dialog', {name:'Vincular resgate ao aporte'});
  const radio = await within(dialogo).findByRole('radio', {name:/Resgate fictício/});
  expect((radio as HTMLInputElement).checked).toBe(false);
  expect((within(dialogo).getByRole('button', {name:'Confirmar reaplicação'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(radio);
  expect((within(dialogo).getByLabelText('Valor reaplicado') as HTMLInputElement).value).toContain('100,00');
  fireEvent.click(within(dialogo).getByRole('button', {name:'Confirmar reaplicação'}));
  await waitFor(()=>expect(screen.queryByRole('dialog', {name:'Vincular resgate ao aporte'})).toBeNull());
  await screen.findByText(/Reaplicação:.*100,00/);
  const consultar=()=>chamar<{metas:{gasto:string}[]}>('/metas/progresso', {parametros:{mes:'2026-11'}});
  expect((await consultar()).metas[0].gasto).toBe('50.00');
  fireEvent.click(screen.getByRole('button', {name:'Desfazer reaplicação: Aporte fictício'}));
  fireEvent.click(await screen.findByRole('button', {name:'Confirmar remoção da reaplicação'}));
  await screen.findByRole('button', {name:'Vincular resgate: Aporte fictício'});
  expect((await consultar()).metas[0].gasto).toBe('150.00');
  const atuais = await chamar<MovimentoDeInvestimento[]>('/movimentos-de-investimento', {parametros});
  expect(atuais.find(m=>m.id===aporteId)?.valor).toBe('150.00');
});


it('cancelar devolve o foco sem criar vínculo nem alterar a meta', async () => {
  prepararCenarioDeReaplicacao();
  const movimentos = await chamar<MovimentoDeInvestimento[]>('/movimentos-de-investimento', {parametros:{inicio:'2026-11-01',fim:'2026-11-30'}});
  const investimentos = await chamar<Investimento[]>('/investimentos');
  render(<MovimentosDeInvestimento movimentos={movimentos} investimentos={investimentos} aoAvisar={()=>{}} aoFalhar={()=>{}}/>);
  const botao=await screen.findByRole('button',{name:'Vincular resgate: Aporte fictício'});
  fireEvent.click(botao);
  const dialogo=await screen.findByRole('dialog',{name:'Vincular resgate ao aporte'});
  fireEvent.click(await within(dialogo).findByRole('radio',{name:/Resgate fictício/}));
  fireEvent.click(within(dialogo).getByRole('button',{name:'Cancelar'}));
  await waitFor(()=>expect(document.activeElement).toBe(botao));
  expect(await chamar('/reaplicacoes-de-resgates')).toEqual([]);
  expect((await chamar<{metas:{gasto:string}[]}>('/metas/progresso',{parametros:{mes:'2026-11'}})).metas[0].gasto).toBe('150.00');
});
