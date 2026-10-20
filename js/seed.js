/* Ratio — contenu d'exemple (premier lancement) : apprendre en voyant un cas réel */
(function (R) {
  'use strict';
  const { U } = R;

  function build(courseId, title, spec, links = []) {
    const S = R.store;
    const map = { id: U.uid('m'), courseId, title, createdAt: Date.now(), updatedAt: Date.now(), viewport: null, nodes: [], edges: [] };
    const byKey = {};
    let y = 0;
    (function walk(s, parent) {
      const n = S.newNode({ type: s.type || 'idee', title: s.t, note: s.note || '', logic: s.logic || null, y: y++ * 10 });
      if (s.key) byKey[s.key] = n.id;
      map.nodes.push(n);
      if (parent) map.edges.push({ id: U.uid('e'), from: parent.id, to: n.id, kind: 'tree', label: s.label || '' });
      (s.children || []).forEach((c) => walk(c, n));
    })(spec, null);
    for (const [a, b, label] of links) map.edges.push({ id: U.uid('e'), from: byKey[a], to: byKey[b], kind: 'link', label });
    const pos = R.layout.tidy(map);
    for (const n of map.nodes) Object.assign(n, pos[n.id]);
    map.needsLayout = true; // recalcul avec les tailles réelles à la première ouverture
    return map;
  }

  R.seed = function () {
    const S = R.store;
    const course = {
      id: U.uid('c'), title: 'Droit des obligations', description: 'Exemple · Le contrat (art. 1101 s. C. civ.)',
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    S.data.courses.push(course);

    const validite = build(course.id, 'Conditions de validité du contrat', {
      t: 'Validité du contrat', type: 'notion',
      note: 'Un contrat n\'est valable que s\'il réunit ==trois conditions de fond cumulatives== (art. 1128 C. civ.) et, le cas échéant, les conditions de forme exigées par la loi.\n\n**Méthode** : en cas pratique, vérifier chaque condition **dans l\'ordre**, puis la forme, puis la sanction.',
      children: [
        {
          t: 'Accord de volontés destiné à créer, modifier, transmettre ou éteindre des obligations', type: 'definition',
          note: 'Définition légale du contrat : art. 1101 C. civ.\n\n- *accord de volontés* → pas de contrat sans rencontre d\'une offre et d\'une acceptation\n- *effets de droit* → distingue le contrat de l\'engagement purement moral',
        },
        {
          t: 'Conditions de fond', type: 'notion', logic: 'et',
          note: '> Sont nécessaires à la validité d\'un contrat :\n> 1° Le consentement des parties ;\n> 2° Leur capacité de contracter ;\n> 3° Un contenu licite et certain.\n\n(art. 1128 C. civ.) — l\'absence d\'une seule suffit à entraîner la nullité.',
          children: [
            {
              t: 'Consentement des parties', type: 'idee', logic: 'et', key: 'consent',
              note: 'Le consentement doit **exister** et être **intègre**.\n\nArt. 1129 : il faut être sain d\'esprit pour consentir valablement.',
              children: [
                { t: 'Existence : rencontre d\'une offre et d\'une acceptation', type: 'idee', note: 'Art. 1113 C. civ. — le contrat est formé par la rencontre d\'une offre et d\'une acceptation.' },
                {
                  t: 'Intégrité : absence de vice', type: 'idee', logic: 'ou',
                  note: 'Un seul vice suffit à entraîner la ==nullité relative== (art. 1131).\n\nLe vice doit être **déterminant** (art. 1130).',
                  children: [
                    { t: 'Erreur', type: 'idee', note: 'Art. 1132 s. — sur les qualités essentielles de la prestation ou du cocontractant.\n\n- doit être **excusable**\n- l\'erreur sur la valeur est indifférente (art. 1136)' },
                    {
                      t: 'Dol', type: 'idee', key: 'dol',
                      note: 'Art. 1137 — manœuvres, mensonges ou **dissimulation intentionnelle** d\'une information déterminante.\n\nL\'erreur provoquée par un dol est toujours excusable (art. 1139).',
                      children: [
                        { t: 'Cass. 1re civ., 3 mai 2000, Baldus', type: 'juris', note: 'L\'acheteur n\'est tenu d\'aucune obligation d\'information **sur la valeur** de la chose.\n\nSolution consacrée par l\'art. 1112-1 al. 2 C. civ.' },
                      ],
                    },
                    { t: 'Violence', type: 'idee', note: 'Art. 1140 s. — contrainte inspirant la crainte d\'exposer sa personne, sa fortune ou celles de ses proches à un mal considérable.\n\nInclut l\'==abus de dépendance== (art. 1143).' },
                  ],
                },
              ],
            },
            {
              t: 'Capacité de contracter', type: 'idee',
              note: 'Art. 1145 — toute personne physique peut contracter sauf en cas d\'incapacité prévue par la loi (mineurs non émancipés, majeurs protégés : art. 1146).\n\nPersonnes morales : capacité limitée par leur objet (principe de spécialité).',
            },
            {
              t: 'Contenu licite et certain', type: 'idee', logic: 'et',
              note: 'Art. 1162 à 1171 C. civ.',
              children: [
                { t: 'Licite : ne déroge pas à l\'ordre public', type: 'idee', note: 'Art. 1162 — ni par ses stipulations, ni par son but (que ce but ait été connu ou non de toutes les parties).' },
                { t: 'Prestation possible et déterminée ou déterminable', type: 'idee', note: 'Art. 1163.' },
              ],
            },
          ],
        },
        {
          t: 'Conditions de forme', type: 'notion',
          note: 'Principe du **consensualisme**, assorti d\'exceptions (art. 1172).',
          children: [
            { t: 'Principe : consensualisme', type: 'idee', note: 'Art. 1172 al. 1 — les contrats sont par principe consensuels : le seul échange des consentements suffit.' },
            { t: 'Contrats solennels', type: 'idee', label: 'sauf', note: 'Art. 1172 al. 2 — validité subordonnée à des formes déterminées par la loi.\n\n*Ex.* : donation (acte notarié, art. 931), contrat de mariage.' },
            { t: 'Contrats réels', type: 'idee', label: 'sauf', note: 'Art. 1172 al. 3 — formation subordonnée à la **remise d\'une chose** (ex. prêt à usage, gage avec dépossession).' },
          ],
        },
        {
          t: 'Sanction : la nullité', type: 'idee', label: 'entraîne', logic: 'ou',
          note: 'Art. 1178 — un contrat qui ne remplit pas les conditions requises pour sa validité est nul. Le contrat annulé est **censé n\'avoir jamais existé** (restitutions : art. 1352 s.).',
          children: [
            { t: 'Nullité relative : protection d\'un intérêt privé', type: 'idee', key: 'relative', note: 'Art. 1179 al. 2 et 1181 — invoquée par la seule partie protégée ; confirmation possible.' },
            { t: 'Nullité absolue : sauvegarde de l\'intérêt général', type: 'idee', note: 'Art. 1179 al. 1 et 1180 — invoquée par toute personne justifiant d\'un intérêt, et par le ministère public.' },
          ],
        },
        {
          t: 'Art. 1128 C. civ.', type: 'texte',
          note: '> Sont nécessaires à la validité d\'un contrat :\n> 1° Le consentement des parties ;\n> 2° Leur capacité de contracter ;\n> 3° Un contenu licite et certain.',
        },
      ],
    }, [['dol', 'relative', 'sanction']]);

    const resp = build(course.id, 'Responsabilité contractuelle', {
      t: 'Responsabilité contractuelle', type: 'notion',
      note: 'Art. 1231-1 C. civ. — le débiteur est condamné à des dommages et intérêts en raison de l\'inexécution de l\'obligation, s\'il ne justifie pas que l\'exécution a été empêchée par la **force majeure**.',
      children: [
        {
          t: 'Conditions', type: 'notion', logic: 'et',
          children: [
            { t: 'Un contrat valable', type: 'idee', note: 'Préalable : sinon, responsabilité extracontractuelle (art. 1240).' },
            { t: 'Une inexécution', type: 'idee', note: 'Inexécution totale, partielle, tardive ou défectueuse.\n\nObligation de **moyens** vs de **résultat**.' },
            { t: 'Un dommage', type: 'idee', note: 'Prévisible lors de la conclusion du contrat (art. 1231-3), sauf faute lourde ou dolosive.' },
            { t: 'Un lien de causalité', type: 'idee', note: 'Le dommage doit être une suite immédiate et directe de l\'inexécution (art. 1231-4).' },
          ],
        },
        {
          t: 'Exonération : force majeure', type: 'idee', label: 'sauf', logic: 'et',
          note: 'Art. 1218 — trois caractères cumulatifs.',
          children: [
            { t: 'Échappe au contrôle du débiteur', type: 'idee' },
            { t: 'Imprévisible lors de la conclusion', type: 'idee' },
            { t: 'Irrésistible dans ses effets', type: 'idee' },
          ],
        },
      ],
    });

    S.data.maps.push(validite, resp);
    S.changed();
    return { course, map: validite };
  };
})(window.R);
