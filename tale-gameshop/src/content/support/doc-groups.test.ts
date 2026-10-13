import {supportDocs} from './docs';
import {groupSupportDocs, supportDocGroups} from './doc-groups';

it('places every support document in exactly one group', () => {
    const listed = supportDocGroups.flatMap((group) => group.docs.map((doc) => doc.id));

    expect(listed.sort()).toEqual(supportDocs.map((doc) => doc.id).sort());
    expect(new Set(listed).size).toBe(listed.length);
});

it('keeps a new document visible even before it is assigned to a group', () => {
    const stranger = {...supportDocs[0], id: 'brand-new-doc', title: 'Brand new'};
    const groups = groupSupportDocs([...supportDocs, stranger]);

    const other = groups.find((group) => group.title === 'Other');
    expect(other?.docs.map((doc) => doc.id)).toEqual(['brand-new-doc']);
});

it('drops a group whose documents were removed instead of showing an empty heading', () => {
    const withoutLegal = supportDocs.filter((doc) => !['terms-of-sale', 'privacy-policy', 'cookie-policy', 'legal-notice'].includes(doc.id));

    expect(groupSupportDocs(withoutLegal).map((group) => group.title)).not.toContain('Legal');
});
