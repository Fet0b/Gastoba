def test_oito_cores_da_paleta():
    from gastoba.domain.cor_da_destinacao import CorDaDestinacao

    assert [c.value for c in CorDaDestinacao] == [
        "ametista",
        "menta",
        "orquidea",
        "ceu",
        "ambar",
        "coral",
        "glicinia",
        "esmeralda",
    ]
