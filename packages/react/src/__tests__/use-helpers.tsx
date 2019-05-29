import * as React from 'react';

import { Observable, Subject } from 'rxjs';

import { configure, shallow } from 'enzyme';
import * as Adapter from 'enzyme-adapter-react-16';

import { useObservable } from '../use-helpers';

configure({ adapter: new Adapter() });

function ObservableComponent(props: { input: Observable<string> }) {
  const inputText = useObservable(props.input, '');

  return (<h2>Hello {inputText}</h2>);
}

describe('useObservable', () => {
  it('Observes a simple Subject', () => {
    const subj: Subject<string> = new Subject();
    const component = <ObservableComponent input={subj} />;
    const fixture = shallow(component);

    expect(fixture.text()).toContain('Hello');
  });
});
