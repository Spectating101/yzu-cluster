from pathlib import Path

path = Path('drive/src/v2/library-live-scale.css')
text = path.read_text()
marker = '/* LIBRARY FINAL FREEZE: compact decision rail */'
if marker not in text:
    text += r'''

/* LIBRARY FINAL FREEZE: compact decision rail
   Same semantic ownership, less vertical serialization. */
.rd-v2-library-inspector-basis {
  padding: 14px 15px 12px;
}

.rd-v2-library-inspector-basis-grid {
  display: block;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.rd-v2-library-inspector-basis-grid > div {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  align-items: baseline;
  gap: 8px;
  padding: 5px 0;
  border: 0;
  border-top: 1px solid rgba(38, 52, 72, .09);
  background: transparent;
}

.rd-v2-library-inspector-basis-grid > div:first-child {
  border-top: 0;
}

.rd-v2-library-inspector-basis-grid > div:nth-child(odd),
.rd-v2-library-inspector-basis-grid > div:nth-child(n + 3) {
  border-right: 0;
}

.rd-v2-library-inspector-basis-grid span {
  margin-bottom: 0;
  font-size: 9px;
  letter-spacing: .06em;
}

.rd-v2-library-inspector-basis-grid strong {
  font-size: 11.5px;
  line-height: 1.25;
}

.rd-v2-library-inspector-next {
  margin-top: 8px;
  padding: 9px 10px;
  border-left-color: rgba(39, 84, 133, .45);
  background: rgba(44, 76, 114, .035);
}

.rd-v2-library-inspector-next > span {
  font-size: 9px;
  letter-spacing: .06em;
}

.rd-v2-library-inspector-next p {
  margin-top: 3px;
  font-size: 10.5px;
  line-height: 1.45;
}

.rd-v2-library-inspector-holdings {
  padding: 12px 15px;
}

.rd-v2-library-inspector-holdings .rd-v2-library-rail-module-title {
  margin: 2px 0 5px;
  font-size: 11.5px;
}

.rd-v2-library-holding-focus {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 2px 8px;
  margin-top: 8px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.rd-v2-library-holding-focus > span {
  grid-column: 1;
  align-self: baseline;
  font-size: 9px;
}

.rd-v2-library-holding-focus strong {
  grid-column: 2;
  font-size: 11.5px;
  line-height: 1.25;
}

.rd-v2-library-holding-focus small {
  grid-column: 2;
  font-size: 9.5px;
  line-height: 1.3;
}

.rd-v2-library-holdings-provider-line {
  margin: 6px 0 0;
  padding-top: 6px;
  border-top: 1px solid rgba(38, 52, 72, .09);
  font-size: 10px;
}

.rd-v2-library-inspector-block {
  padding: 12px 15px;
}

.rd-v2-library-inspector-block .rd-v2-library-rail-module-title {
  margin: 2px 0 4px;
  font-size: 12px;
}

.rd-v2-library-inspector-prose {
  margin: 4px 0;
  font-size: 10.5px;
  line-height: 1.45;
}

.rd-v2-library-verify-list {
  gap: 3px;
  margin: 6px 0 0;
}

.rd-v2-library-verify-list li {
  font-size: 10px;
  line-height: 1.35;
}

.rd-v2-library-inspector-tech {
  margin: 9px 15px 12px;
}

.rd-v2-library-inspector-tech > summary {
  font-size: 10.5px;
}

@media (max-width: 760px) {
  .rd-v2-library-inspector-basis-grid > div {
    grid-template-columns: 84px minmax(0, 1fr);
  }
}
'''
    path.write_text(text)
