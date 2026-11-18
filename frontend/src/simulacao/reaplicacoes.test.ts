import { expect, it } from 'vitest';
import { chamar, ErroDaApiCliente } from '../api/cliente';
import type { ReaplicacaoDeResgate, ResgateParaReaplicar } from '../api/tipos';
import { prepararCenarioDeReaplicacao } from './manipuladores';

const progresso = async (mes:string) => (await chamar<{metas:{gasto:string}[]}>('/metas/progresso',{parametros:{mes}})).metas[0].gasto;

it('parcela parcial afeta somente o mês do aporte, impede duplicação e libera pontas ao remover',async()=>{
 const {aporteId,resgateId}=prepararCenarioDeReaplicacao();
 expect(await progresso('2026-10')).toBe('0.00');
 expect(await progresso('2026-11')).toBe('150.00');
 const candidatos=await chamar<ResgateParaReaplicar[]>(`/movimentos-de-investimento/${aporteId}/resgates-para-reaplicar`);
 expect(candidatos).toHaveLength(1);expect(candidatos[0].disponivel).toBe('100.00');
 const corpo={aporte_id:aporteId,resgate_id:resgateId,valor:'30.01'};
 const vinculo=await chamar<ReaplicacaoDeResgate>('/reaplicacoes-de-resgates',{metodo:'POST',corpo});
 expect(await progresso('2026-11')).toBe('119.99');expect(await progresso('2026-10')).toBe('0.00');
 await expect(chamar('/reaplicacoes-de-resgates',{metodo:'POST',corpo})).rejects.toMatchObject({status:409});
 expect(await chamar(`/movimentos-de-investimento/${aporteId}/resgates-para-reaplicar`)).toEqual([]);
 await chamar(`/reaplicacoes-de-resgates/${vinculo.id}`,{metodo:'DELETE'});
 expect(await progresso('2026-11')).toBe('150.00');
 expect(await chamar(`/movimentos-de-investimento/${aporteId}/resgates-para-reaplicar`)).toHaveLength(1);
 await expect(chamar(`/reaplicacoes-de-resgates/${vinculo.id}`,{metodo:'DELETE'})).rejects.toBeInstanceOf(ErroDaApiCliente);
 await chamar('/reaplicacoes-de-resgates',{metodo:'POST',corpo:{...corpo,valor:'100.00'}});
 expect(await progresso('2026-11')).toBe('50.00');
});

for(const valor of ['0.00','-0.01','100.01','150.01'])it(`recusa valor fora da capacidade ${valor} sem alterar a meta`,async()=>{
 const {aporteId,resgateId}=prepararCenarioDeReaplicacao();
 await expect(chamar('/reaplicacoes-de-resgates',{metodo:'POST',corpo:{aporte_id:aporteId,resgate_id:resgateId,valor}})).rejects.toMatchObject({status:422});
 expect(await chamar('/reaplicacoes-de-resgates')).toEqual([]);expect(await progresso('2026-11')).toBe('150.00');
});
