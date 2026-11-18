"""N1–N4: restrições reais, sem HTTP ou dados de produção."""

from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import IntegrityError

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.gasto import Gasto
from gastoba.domain.tag import Tag
from gastoba.infrastructure.persistencia.modelos import (
    CadastroDeDestinacaoModelo,
    ContaModelo,
    DestinacaoModelo,
    InvestimentoModelo,
    MovimentoDeInvestimentoModelo,
    TagDeGastoModelo,
    TransacaoImportadaModelo,
    TransferenciaEntreContasModelo,
    UsuarioModelo,
)
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


def cenario(fabrica):
    pessoa, outra, origem, destino, alheia = [uuid4() for _ in range(5)]
    with fabrica.begin() as s:
        s.add_all([UsuarioModelo(id=pessoa, nome="Uma"), UsuarioModelo(id=outra, nome="Outra")])
        s.flush()
        s.add_all(
            [
                ContaModelo(id=i, usuario_id=u, nome=str(i), saldo_centavos=0, origem="manual")
                for i, u in [(origem, pessoa), (destino, pessoa), (alheia, outra)]
            ]
        )
    return pessoa, origem, destino, alheia


def test_tags_sao_relacionais_ordenadas_e_filtraveis(fabrica_de_sessoes):
    pessoa, conta, _, _ = cenario(fabrica_de_sessoes)
    g = Gasto(
        conta,
        Dinheiro(321),
        "Teste",
        date(2026, 11, 8),
        CategoriaDoGasto.LAZER,
        tags=(Tag("z"), Tag("a")),
    )
    uow = UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)
    with uow as u:
        u.gastos.adicionar(g)
        u.commit()
    with uow as u:
        lidos = u.gastos.listar(pessoa, date.min, date.max, tag=Tag("a"))
        assert lidos[0].tags == (Tag("z"), Tag("a"))
        assert u.gastos.listar_tags(pessoa) == [Tag("a"), Tag("z")]
    with fabrica_de_sessoes() as s:
        assert "tags" not in {c["name"] for c in inspect(s.bind).get_columns("gastos")}
        assert len(s.scalars(select(TagDeGastoModelo)).all()) == 2
        s.execute(text("DELETE FROM gastos"))
        s.commit()
        assert not s.scalars(select(TagDeGastoModelo)).all()


def test_destinacao_renomeia_sem_regravar_partes(fabrica_de_sessoes):
    pessoa, conta, _, _ = cenario(fabrica_de_sessoes)
    cadastro, movimento, parte = uuid4(), uuid4(), uuid4()
    with fabrica_de_sessoes.begin() as s:
        s.add(CadastroDeDestinacaoModelo(id=cadastro, usuario_id=pessoa, nome="viagem"))
        s.add(
            MovimentoDeInvestimentoModelo(
                id=movimento,
                conta_id=conta,
                tipo="aporte",
                descricao="Teste",
                valor_centavos=100,
                data=date(2026, 11, 8),
                origem="manual",
            )
        )
        s.flush()
        s.add(
            DestinacaoModelo(
                id=parte,
                movimento_id=movimento,
                destinacao_id=cadastro,
                valor_centavos=100,
                categoria="lazer",
            )
        )
    with fabrica_de_sessoes.begin() as s:
        s.get(CadastroDeDestinacaoModelo, cadastro).nome = "férias"
    with fabrica_de_sessoes() as s:
        p = s.get(DestinacaoModelo, parte)
        assert p.destinacao_id == cadastro and p.tag == "férias"
        assert p.valor_centavos == 100 and p.categoria == "lazer"
        assert "tag" not in {c["name"] for c in inspect(s.bind).get_columns("destinacoes")}


def test_conta_remunerada_tem_fk_e_mesmo_dono(fabrica_de_sessoes):
    pessoa, _, _, alheia = cenario(fabrica_de_sessoes)
    with fabrica_de_sessoes() as s, pytest.raises(IntegrityError):
        s.add(
            InvestimentoModelo(
                id=uuid4(),
                usuario_id=pessoa,
                id_externo="posição",
                nome="Teste",
                tipo="CAIXINHA",
                saldo_centavos=100,
                dados="{}",
                conta_remunerada_id=alheia,
            )
        )
        s.flush()


def test_transferencia_valida_reserva_e_libera_pontas_no_banco(fabrica_de_sessoes):
    pessoa, origem, destino, _ = cenario(fabrica_de_sessoes)
    ponta, transferencia = uuid4(), uuid4()
    with fabrica_de_sessoes.begin() as s:
        s.add(
            TransacaoImportadaModelo(
                id=ponta,
                conta_id=origem,
                id_externo="ponta",
                data=date(2026, 11, 8),
                descricao="Teste",
                valor_centavos=100,
                sentido="saida",
                estado="aceita",
            )
        )
        s.flush()
        s.add(
            TransferenciaEntreContasModelo(
                id=transferencia,
                usuario_id=pessoa,
                conta_origem_id=origem,
                conta_destino_id=destino,
                valor_centavos=100,
                data=date(2026, 11, 8),
                papel_origem="corrente",
                papel_destino="investimento",
                transacao_origem_id=ponta,
                competencia_provisoria=True,
                ativa=True,
            )
        )
    with fabrica_de_sessoes.begin() as s:
        assert s.execute(text("SELECT count(*) FROM pontas_de_transferencias")).scalar_one() == 1
        s.get(TransferenciaEntreContasModelo, transferencia).ativa = False
    with fabrica_de_sessoes() as s:
        assert s.execute(text("SELECT count(*) FROM pontas_de_transferencias")).scalar_one() == 0
        assert s.get(TransferenciaEntreContasModelo, transferencia).transacao_origem_id == ponta


@pytest.mark.parametrize("erro", ["dono", "conta", "valor", "sentido"])
def test_transferencia_recusa_relacoes_incoerentes(fabrica_de_sessoes, erro):
    pessoa, origem, destino, alheia = cenario(fabrica_de_sessoes)
    ponta = uuid4()
    with fabrica_de_sessoes.begin() as s:
        s.add(
            TransacaoImportadaModelo(
                id=ponta,
                conta_id=destino if erro == "conta" else origem,
                id_externo="ponta",
                data=date(2026, 11, 8),
                descricao="Teste",
                valor_centavos=101 if erro == "valor" else 100,
                sentido="entrada" if erro == "sentido" else "saida",
                estado="aceita",
            )
        )
    with fabrica_de_sessoes() as s, pytest.raises(IntegrityError):
        s.add(
            TransferenciaEntreContasModelo(
                id=uuid4(),
                usuario_id=pessoa,
                conta_origem_id=origem,
                conta_destino_id=alheia if erro == "dono" else destino,
                valor_centavos=100,
                data=date(2026, 11, 8),
                papel_origem="corrente",
                papel_destino="investimento",
                transacao_origem_id=ponta,
                competencia_provisoria=True,
                ativa=True,
            )
        )
        s.flush()


def test_tag_de_outra_pessoa_e_referencia_textual_nao_contornam_fk(fabrica_de_sessoes):
    from gastoba.infrastructure.persistencia.modelos import GastoModelo, TagModelo

    pessoa, conta, _, alheia = cenario(fabrica_de_sessoes)
    tag, gasto = uuid4(), uuid4()
    with fabrica_de_sessoes.begin() as s:
        s.add(TagModelo(id=tag, usuario_id=s.get(ContaModelo, alheia).usuario_id, nome="privada"))
        s.add(
            GastoModelo(
                id=gasto,
                conta_id=conta,
                descricao="Teste",
                valor_centavos=100,
                data=date(2026, 11, 8),
                categoria="lazer",
                origem="manual",
            )
        )
    with fabrica_de_sessoes() as s, pytest.raises(IntegrityError):
        s.add(TagDeGastoModelo(gasto_id=gasto, tag_id=tag, ordem=0))
        s.flush()


def test_saldo_inicial_nao_pode_trocar_dono_indiretamente(fabrica_de_sessoes):
    pessoa, _, _, alheia = cenario(fabrica_de_sessoes)
    inv, outro_inv, mov, cadastro = [uuid4() for _ in range(4)]
    with fabrica_de_sessoes.begin() as s:
        for id_, dono in [(inv, pessoa), (outro_inv, s.get(ContaModelo, alheia).usuario_id)]:
            s.add(
                InvestimentoModelo(
                    id=id_,
                    usuario_id=dono,
                    id_externo=str(id_),
                    nome="Teste",
                    tipo="FIXED_INCOME",
                    saldo_centavos=100,
                    dados="{}",
                )
            )
        s.add(CadastroDeDestinacaoModelo(id=cadastro, usuario_id=pessoa, nome="reserva"))
        s.flush()
        s.add(
            MovimentoDeInvestimentoModelo(
                id=mov,
                investimento_id=inv,
                tipo="aporte",
                descricao="Inicial",
                valor_centavos=100,
                data=date(2026, 11, 8),
                origem="saldo_inicial",
            )
        )
        s.flush()
        s.add(
            DestinacaoModelo(
                id=uuid4(), movimento_id=mov, destinacao_id=cadastro, valor_centavos=100
            )
        )
    with fabrica_de_sessoes() as s, pytest.raises(IntegrityError):
        s.get(MovimentoDeInvestimentoModelo, mov).investimento_id = outro_inv
        s.flush()


def test_ponta_ativa_e_unica_e_pode_ser_reclassificada_apos_reversao(fabrica_de_sessoes):
    pessoa, origem, destino, _ = cenario(fabrica_de_sessoes)
    ponta, primeira, segunda = uuid4(), uuid4(), uuid4()

    def modelo(id_):
        return TransferenciaEntreContasModelo(
            id=id_,
            usuario_id=pessoa,
            conta_origem_id=origem,
            conta_destino_id=destino,
            valor_centavos=100,
            data=date(2026, 11, 8),
            papel_origem="corrente",
            papel_destino="investimento",
            transacao_origem_id=ponta,
            competencia_provisoria=True,
            ativa=True,
        )

    with fabrica_de_sessoes.begin() as s:
        s.add(
            TransacaoImportadaModelo(
                id=ponta,
                conta_id=origem,
                id_externo="ponta",
                data=date(2026, 11, 8),
                descricao="Teste",
                valor_centavos=100,
                sentido="saida",
                estado="aceita",
            )
        )
        s.flush()
        s.add(modelo(primeira))
    with fabrica_de_sessoes() as s, pytest.raises(IntegrityError):
        s.add(modelo(segunda))
        s.flush()
    with fabrica_de_sessoes.begin() as s:
        s.get(TransferenciaEntreContasModelo, primeira).ativa = False
        s.flush()
        s.add(modelo(segunda))
    with fabrica_de_sessoes() as s:
        assert s.execute(text("SELECT count(*) FROM pontas_de_transferencias")).scalar_one() == 1
        assert len(s.scalars(select(TransferenciaEntreContasModelo)).all()) == 2
